import json, mimetypes, sys, webbrowser, re
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse, unquote

from backend import service

PROJECT_ROOT = Path(__file__).resolve().parent
FRONTEND_ROOT = PROJECT_ROOT / "frontend"
PORT = 8000
mimetypes.add_type("text/javascript", ".js"); mimetypes.add_type("text/javascript", ".mjs"); mimetypes.add_type("font/woff2", ".woff2")
mimetypes.add_type("audio/wav", ".wav"); mimetypes.add_type("audio/mpeg", ".mp3"); mimetypes.add_type("audio/ogg", ".ogg"); mimetypes.add_type("audio/webm", ".webm"); mimetypes.add_type("model/gltf-binary", ".glb")


class Handler(SimpleHTTPRequestHandler):
    def translate_path(self, path):
        parsed = urlparse(path)
        parts = [unquote(x) for x in parsed.path.split("/") if x and x not in (".", "..")]
        target = FRONTEND_ROOT.joinpath(*parts).resolve()
        if target != FRONTEND_ROOT.resolve() and FRONTEND_ROOT.resolve() not in target.parents:
            return str(FRONTEND_ROOT / "__not_found__")
        return str(target)

    def _send_json(self, value, status=200):
        def finite(item):
            if isinstance(item, float) and (item != item or item in (float("inf"), float("-inf"))): return None
            if isinstance(item, dict): return {k: finite(v) for k, v in item.items()}
            if isinstance(item, (list, tuple)): return [finite(v) for v in item]
            return item
        body = json.dumps(finite(value), allow_nan=False).encode("utf-8")
        self.send_response(status); self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body))); self.end_headers(); self.wfile.write(body)

    def _body(self):
        length = int(self.headers.get("Content-Length", "0"))
        if length > 8 * 1024 * 1024: raise ValueError("Request body is too large.")
        raw = self.rfile.read(length) if length else b"{}"
        value = json.loads(raw.decode("utf-8"))
        if not isinstance(value, dict): raise ValueError("JSON request body must be an object.")
        return value

    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/api/health": return self._send_json({"ok": True, "service": "missionforge", "version": 1})
        if path == "/api/part-assets":
            folder = FRONTEND_ROOT / "assets" / "parts"
            files = sorted(p.name for p in folder.iterdir() if p.is_file() and p.suffix.lower() == ".png") if folder.exists() else []
            return self._send_json(files)
        if path == "/api/assets": return self._send_json(service.asset_manifest())
        if path == "/api/audio-assets": return self._send_json(service.audio_manifest())
        if path == "/api/blueprints": return self._send_json(service.list_blueprints())
        if path.startswith("/api/blueprints/"):
            identifier = path.rsplit("/", 1)[-1]
            value = service.get_blueprint(identifier)
            return self._send_json({"blueprint": value["blueprint"]} if value else {"detail": "Blueprint not found."}, 200 if value else 404)
        if path == "/api/progress": return self._send_json(service.get_progress())
        if path == "/api/settings": return self._send_json(service.get_settings())
        if path.startswith("/api/flight/") and path.endswith("/snapshot"):
            parts = path.strip("/").split("/")
            if len(parts) == 4:
                session_id = unquote(parts[2])
                snap = service.get_flight_snapshot(session_id)
                if snap is not None:
                    return self._send_json(snap)
                return self._send_json({"detail": "Flight session not found."}, 404)
        if path.startswith("/api/"): return self._send_json({"detail": "API route not found."}, 404)
        return super().do_GET()

    def do_POST(self):
        path = urlparse(self.path).path
        try:
            data = self._body()
            if path.startswith("/api/flight/") and path.endswith("/predict"):
                parts = path.strip("/").split("/")
                if len(parts) == 4:
                    result = service.predict_flight(unquote(parts[2]), data)
                    if result is None:
                        return self._send_json({"detail": "Flight session not found."}, 404)
                    return self._send_json(result)
            if path == "/api/flight/start":
                return self._send_json(service.start_flight(data))
            if path.startswith("/api/flight/") and path.endswith("/command"):
                parts = path.strip("/").split("/")
                if len(parts) == 4:
                    session_id = unquote(parts[2])
                    return self._send_json(service.flight_command(session_id, data))
            if path.startswith("/api/flight/") and path.endswith("/close"):
                parts = path.strip("/").split("/")
                
                if len(parts) == 4:
                    session_id = unquote(parts[2])
                    return self._send_json(service.close_flight(session_id))
            if path.startswith("/api/"):
                try: return self._send_json(service.dispatch_calculation(path, data))
                except service.UnknownEndpoint: return self._send_json({"detail": "API route not found."}, 404)
            return self._send_json({"detail": "Route not found."}, 404)
        
        except KeyError as exc:
            return self._send_json({"detail": f"Missing or unknown field: {exc}"}, 400)
        except (ValueError, TypeError, ZeroDivisionError, OverflowError) as exc:
            return self._send_json({"detail": str(exc)}, 400)

    def do_PUT(self):
        path = urlparse(self.path).path
        try:
            data = self._body()
            if path.startswith("/api/blueprints/"):
                identifier = path.rsplit("/", 1)[-1]
                blueprint = data.get("blueprint", data)
                return self._send_json(service.save_blueprint(identifier, blueprint))
            if path.startswith("/api/progress/"):
                identifier = path.rsplit("/", 1)[-1]
                value = {"completed": bool(data.get("completed")), "stats": data.get("stats", {})}
                return self._send_json(service.put_progress(identifier, value))
            if path == "/api/settings": return self._send_json(service.put_settings(data))
            return self._send_json({"detail": "API route not found."}, 404)
        except (ValueError, TypeError) as exc: return self._send_json({"detail": str(exc)}, 400)

    def do_DELETE(self):
        path = urlparse(self.path).path
        if path.startswith("/api/blueprints/"):
            identifier = path.rsplit("/", 1)[-1]
            service.delete_blueprint(identifier)
            return self._send_json({"ok": True})
        return self._send_json({"detail": "API route not found."}, 404)

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache"); super().end_headers()

    def log_message(self, format: str, *args: object) -> None: pass


if __name__ == "__main__":
    try: srv = ThreadingHTTPServer(("127.0.0.1", PORT), partial(Handler))
    except OSError:
        print(f"Port {PORT} is already in use. Run stop.bat first, then try again."); sys.exit(1)
    print(f"MissionForge at http://127.0.0.1:{PORT}  - close this window to quit")
    if "--no-browser" not in sys.argv: webbrowser.open(f"http://127.0.0.1:{PORT}")
    srv.serve_forever()