
import json, sys, glob
pid, new = sys.argv[1], float(sys.argv[2])
path = glob.glob(f'frontend/data/parts/*/{pid}/part.json')[0]
d = json.load(open(path, encoding='utf8'))
d['diameter'] = d['topD'] = d['bottomD'] = new
d['dimensions'].update(diameterM=new, topDiameterM=new, bottomDiameterM=new)
for a in d['attachmentPoints']:
    if 'diameterM' in a: a['diameterM'] = new
d['compatibility'].update(topDiameterM=new, bottomDiameterM=new)
json.dump(d, open(path, 'w', encoding='utf8'), indent=2)
print('updated', path)