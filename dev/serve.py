"""Anteprima locale di Tillverka senza cache: python dev/serve.py [porta]"""
import http.server, os, sys, functools
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, must-revalidate')
        super().end_headers()
    def log_message(self, *a):
        pass
port = int(sys.argv[1]) if len(sys.argv) > 1 else 8790
http.server.ThreadingHTTPServer(('127.0.0.1', port), functools.partial(NoCache, directory=root)).serve_forever()
