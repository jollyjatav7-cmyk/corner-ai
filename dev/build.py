"""Assemble the app into one index.html (plus sw.js, manifest, README) for GitHub Pages,
and an artifact variant without the service worker.

Usage (from the repo root):  python3 -I dev/build.py [out_dir]
"""
import json, os, re, shutil, sys

DEV = os.path.dirname(os.path.abspath(__file__))
SRC, DATA = os.path.join(DEV, 'src'), os.path.join(DEV, 'data')
OUT = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else os.path.dirname(DEV)


def read(*p):
    return open(os.path.join(*p), encoding='utf-8').read()


ver = re.search(r"corner-ai-(v\d+)", read(SRC, 'sw.js')).group(1)
t = read(SRC, 'app.html')
bundle = read(DATA, 'bundle.json')
core = read(SRC, 'app_core.js')
net = read(SRC, 'app_net.js')
ui = read(SRC, 'app_ui.js').replace("/*ABOUT*/''", json.dumps(read(SRC, 'about.html'), ensure_ascii=False)).replace('/*APPVER*/', ver)
for name, s in [('bundle', bundle), ('core', core), ('net', net), ('ui', ui)]:
    assert '</script' not in s.lower(), name
for key in ('/*BUNDLE*/null', '/*CORE*/', '/*NET*/', '/*UI*/', '<!--SW-->'):
    assert t.count(key) == 1, key
page = t.replace('/*BUNDLE*/null', bundle).replace('/*CORE*/', core).replace('/*NET*/', net).replace('/*UI*/', ui)

head = '''<!doctype html>
<html lang="zh-Hans">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="角球进球预测">
<meta name="theme-color" content="#151f1b">
<link rel="manifest" href="./manifest.webmanifest">
<link rel="apple-touch-icon" href="./icon-180.png">
<link rel="icon" type="image/png" sizes="192x192" href="./icon-192.png">
<style>:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}[hidden]{display:none!important}img{max-width:100%}</style>
'''
title_end = page.index('</title>') + len('</title>')
body_start = page.index('<header class="top"')
pwa = (head + page[:body_start] + '</head>\n<body>\n' + page[body_start:].replace('<!--SW-->', read(SRC, 'sw_register.html'))
       + '\n</body>\n</html>\n')
os.makedirs(OUT, exist_ok=True)
open(os.path.join(OUT, 'index.html'), 'w', encoding='utf-8').write(pwa)
for f in ('sw.js', 'manifest.webmanifest', 'README.md'):
    shutil.copy(os.path.join(SRC, f), os.path.join(OUT, f))
os.makedirs(os.path.join(DEV, 'out'), exist_ok=True)
assert page.count('/*ARTIFACT*/false') == 1
open(os.path.join(DEV, 'out', 'artifact.html'), 'w', encoding='utf-8').write(page.replace('<!--SW-->', '').replace('/*ARTIFACT*/false', 'true'))
print('built', len(pwa.encode()) // 1024, 'KB, version', ver, '->', OUT)
