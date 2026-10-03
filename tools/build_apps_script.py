#!/usr/bin/env python3
"""Builds the Google Apps Script files in apps-script/: Index.html, Styles.html, Core.html, Views.html, App.html.
The app is split in five smaller files so each can be pasted into Apps Script without being cut off, and so
Code.gs can tell which one is missing or incomplete. JS is minified with terser when available (npx terser).
Run from the project folder:  python3 tools/build_apps_script.py
Paste each generated file into the Apps Script file with the same name (see apps-script/SETUP.md)."""
import re, pathlib, subprocess, shutil
root = pathlib.Path(__file__).resolve().parent.parent
out = root / 'apps-script'

def minify(src, name):
    cmd = shutil.which('terser') or (str(next(iter(root.glob('**/node_modules/.bin/terser')), '')) or None)
    if not cmd:
        print('terser not found: keeping', name, 'unminified'); return src
    r = subprocess.run([cmd, '-c', '-m'], input=src.encode('utf-8'), capture_output=True)
    if r.returncode != 0 or not r.stdout:
        print('terser failed for', name, r.stderr.decode()[:200]); return src
    return r.stdout.decode('utf-8')

def js(names):
    return '\n'.join((root / 'js' / f'{n}.js').read_text(encoding='utf-8') for n in names)

page = (root / 'index.html').read_text(encoding='utf-8')
body = page[page.index('<body>') + 6:page.index('<script src="https://cdnjs')]
fonts = re.search(r'<link rel="stylesheet" href="https://fonts[^>]*>', page).group(0)
css = (root / 'css' / 'styles.css').read_text(encoding='utf-8')
css = re.sub(r'/\*.*?\*/', '', css, flags=re.S); css = re.sub(r'\n\s*\n+', '\n', css)

parts = {
    'Styles': f'<style>\n{css}\n</style>\n<!-- NCR-END-Styles -->\n',
    'Core': '<script>\n' + minify(js(['logic', 'store', 'importer']), 'core') + '\n</script>\n<!-- NCR-END-Core -->\n',
    'Views': '<script>\n' + minify(js(['views']), 'views') + '\n</script>\n<!-- NCR-END-Views -->\n',
    'App': '<script>\n' + minify(js(['app']), 'app') + '\n</script>\n<!-- NCR-END-App -->\n',
}
for name, text in parts.items():
    assert '</script' not in text.replace('</script>\n<!-- NCR-END', ''), name
    (out / f'{name}.html').write_text(text, encoding='utf-8')
index = f'''<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>NCR Follow-up Control</title>
{fonts}
<?!= include('Styles'); ?>
</head>
<body>
{body}
<script src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"></script>
<?!= include('Core'); ?>
<?!= include('Views'); ?>
<?!= include('App'); ?>
<!-- NCR-END-Index -->
</body></html>
'''
(out / 'Index.html').write_text(index, encoding='utf-8')
for n in ['Index', 'Styles', 'Core', 'Views', 'App']:
    print(f'{n}.html', round((out / f"{n}.html").stat().st_size / 1024), 'KB')
