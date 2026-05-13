#!/usr/bin/env -S python3 -u
"""Serve this folder over HTTP on a free port (avoids 'Address already in use')."""
import http.server
import os
import socketserver

ROOT = os.path.dirname(os.path.abspath(__file__))
os.chdir(ROOT)

Handler = http.server.SimpleHTTPRequestHandler
with socketserver.TCPServer(("127.0.0.1", 0), Handler) as httpd:
    port = httpd.server_address[1]
    print(f"Open in your browser: http://127.0.0.1:{port}/", flush=True)
    print("Press Ctrl+C to stop.", flush=True)
    httpd.serve_forever()
