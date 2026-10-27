# Local preview server: like `python -m http.server`, but /terms serves terms.html (same as Vercel's cleanUrls)
import http.server, os, sys

class Handler(http.server.SimpleHTTPRequestHandler):
    def translate_path(self, path):
        p = super().translate_path(path)
        if not os.path.exists(p) and os.path.exists(p + '.html'):
            return p + '.html'
        return p

port = int(sys.argv[1]) if len(sys.argv) > 1 else 5177
http.server.ThreadingHTTPServer(('', port), Handler).serve_forever()
