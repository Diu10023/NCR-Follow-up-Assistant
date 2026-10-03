#!/usr/bin/env python3
"""Builds apps-script/Index.html: the whole web app (HTML + CSS + JS) in one file for Google Apps Script.
Run from the project folder:  python3 tools/build_apps_script.py
Then paste apps-script/Index.html into the Apps Script file named "Index" (see apps-script/SETUP.md)."""
import re, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
page = (root / 'index.html').read_text(encoding='utf-8')
body = page[page.index('<body>') + 6:page.index('<script src="https://cdnjs')]
fonts = re.search(r'<link rel="stylesheet" href="https://fonts[^>]*>', page).group(0)
css = (root / 'css' / 'styles.css').read_text(encoding='utf-8')
js = ''.join('<script>\n' + (root / 'js' / f'{n}.js').read_text(encoding='utf-8') + '\n</script>\n' for n in ['logic', 'store', 'importer', 'views', 'app'])
assert '</script' not in ''.join((root / 'js' / f'{n}.js').read_text(encoding='utf-8') for n in ['logic', 'store', 'importer', 'views', 'app'])
out = f'''<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>NCR Follow-up Control</title>
{fonts}
<style>
{css}
</style></head>
<body>
{body}
<script src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"></script>
{js}<!-- NCR-APP-END -->
</body></html>
'''
(root / 'apps-script' / 'Index.html').write_text(out, encoding='utf-8')
print('wrote apps-script/Index.html', len(out) // 1024, 'KB')
