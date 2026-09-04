"""简易静态文件服务器 — 带 no-cache 头，防止浏览器缓存旧版前端"""
import http.server
import socketserver
import sys
import os

class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def send_head(self):
        resp = super().send_head()
        return resp

if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 5173
    directory = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(__file__), "..", "dist")
    os.makedirs(directory, exist_ok=True)
    os.chdir(directory)
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("0.0.0.0", port), NoCacheHandler) as httpd:
        print(f"Static server on :{port} from {os.getcwd()}")
        httpd.serve_forever()
