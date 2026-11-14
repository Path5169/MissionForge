import math
epsilon=1e-8

joint_types={
    "distance",
    "rope",
    "revolute",
    "weld",
    "prismatic"
}

def inverse_mass(body):
    if body.get("static", False):
        return 0.0

    mass = float(body.get("mass", 0.0))

    if mass <= epsilon:
        return 0.0

    return 1.0 / mass

def inverse_inertia(body):
    if body.get("static", False):
        return 0.0

    inertia = float(body.get("assemblyInertia", 0.0))

    if inertia <= epsilon:
        return 0.0

    return 1.0 / inertia


def world_anchor(body, anchor):
    angle = body_rotation(body)
    cosine = math.cos(angle)
    sine = math.sin(angle)
    return (
        body.get("x", 0.0) + anchor[0] * cosine - anchor[1] * sine,
        body.get("y", 0.0) + anchor[0] * sine + anchor[1] * cosine
    )


def create_joint(
        joint_type,
        body_a,
        body_b,
        anchor_a=(0.0,0.0),
        anchor_b=(0.0,0.0),
        distance=None,
        axis=(1.0,0.0)):

    if joint_type not in joint_types:
        raise ValueError("Invalid joint type")

    if body_a is body_b:
        raise ValueError("A joint require two different bodies")

    if not isinstance(body_a,dict) or not isinstance(body_b,dict):
        raise TypeError("The parts must be in dictionaries")

    if len(axis)!=2:
        raise ValueError("Axis must contains two values")
    axis_length=math.hypot(axis[0],axis[1])

    if axis_length<epsilon:
        raise ValueError("Joint axis cannot be zero")

    axis=(
        axis[0]/axis_length,
        axis[1]/axis_length
    )
    initial_anchor_a = world_anchor(body_a, anchor_a)
    initial_anchor_b = world_anchor(body_b, anchor_b)

    initial_distance = math.hypot(
        initial_anchor_b[0] - initial_anchor_a[0],
        initial_anchor_b[1] - initial_anchor_a[1])

    if distance is not None and distance<0:
        raise ValueError("Joint distance cannot be negative")
    if joint_type in{"distance","rope"} and distance is None:
        distance=initial_distance

    reference_angle=(
        body_rotation(body_b)-body_rotation(body_a)
    )

    return{
        "type":joint_type,
        "body_a":body_a,
        "body_b":body_b,
        "anchor_a":tuple(anchor_a),
        "anchor_b":tuple(anchor_b),
        "distance":distance,
        "axis":axis,
        "reference_angle":reference_angle,
        "enabled":True
    }


def body_rotation(body):
    return body.get("angle", 0.0)


class constraintrow:
    def __init__(
        self,
        body_a,
        body_b,
        direction,
        radius_a,
        radius_b,
        error=0.0,
        impulse=0.0):

        self.body_a=body_a
        self.body_b=body_b
        self.direction=direction
        self.radius_a=radius_a
        self.radius_b=radius_b
        self.error=error
        self.impulse=0.0

    def effective_mass(self):
        inv_mass_a=self.body_a.get("inv_mass",0.0)
        inv_mass_b=self.body_b.get("inv_mass",0.0)
        inv_inertia_a=self.body_a.get("inv_inertia",0.0)
        inv_inertia_b=self.body_b.get("inv_inertia",0.0)

        k=inv_mass_a+inv_mass_b
        k+=inv_inertia_a*(self.radius_a**2)
        k+=inv_inertia_b*(self.radius_b**2)

        if k<epsilon:
            return 0.0
        return 1.0/k

    def relative_velocity(self):
        vx_a=self.body_a.get("vx",0.0)
        vy_a=self.body_a.get("vy",0.0)
        vx_b=self.body_b.get("vx",0.0)
        vy_b=self.body_b.get("vy",0.0)

        rvx=vx_b-vx_a
        rvy=vy_b-vy_a

        return rvx*self.direction[0]+rvy*self.direction[1]

    def apply_impulse(self, impulse):
        self.impulse+=impulse

        inv_mass_a=self.body_a.get("inv_mass",0.0)
        inv_mass_b=self.body_b.get("inv_mass",0.0)
        inv_inertia_a=self.body_a.get("inv_inertia",0.0)
        inv_inertia_b=self.body_b.get("inv_inertia",0.0)

        self.body_a["vx"]=self.body_a.get("vx",0.0)-impulse*inv_mass_a*self.direction[0]
        self.body_a["vy"]=self.body_a.get("vy",0.0)-impulse*inv_mass_a*self.direction[1]
        self.body_b["vx"]=self.body_b.get("vx",0.0)+impulse*inv_mass_b*self.direction[0]
        self.body_b["vy"]=self.body_b.get("vy",0.0)+impulse*inv_mass_b*self.direction[1]

        self.body_a["angular_velocity"]=self.body_a.get("angular_velocity",0.0)-impulse*inv_inertia_a*self.radius_a
        self.body_b["angular_velocity"]=self.body_b.get("angular_velocity",0.0)+impulse*inv_inertia_b*self.radius_b

    def solve(self, dt):
        mass=self.effective_mass()
        if mass<epsilon:
            return 
        velocity=self.relative_velocity()
        delta_impulse=-mass*(velocity+self.error/dt)
        self.impulse+=delta_impulse
        self.apply_impulse(delta_impulse)


    def add(a, b):
        return (
        a[0] + b[0],
        a[1] + b[1]
        )


    def sub(a, b):
        return (
        a[0] - b[0],
        a[1] - b[1]
         )


    def mul(vector, scalar):
        return (
        vector[0] * scalar,
        vector[1] * scalar
        )


    def dot(a, b):
        return (
        a[0] * b[0] +
        a[1] * b[1]
        )


    def cross(a, b):
        return (
        a[0] * b[1] -
        a[1] * b[0]
        )


    def point_velocity(body, radius):
        angular_velocity = body.get("angular_velocity", 0.0)
        return (
        body.get("vx", 0.0) - angular_velocity * radius[1],
        body.get("vy", 0.0) + angular_velocity * radius[0]
        )
