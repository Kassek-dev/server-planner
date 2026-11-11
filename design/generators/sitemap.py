W,H=2800,1400
LINE='#959595'
els_bg=[]; arrows=[]; cards=[]; labels=[]
mid=[0]
def seg(x1,y1,x2,y2,head=False):
    # straight horizontal/vertical segment from (x1,y1) to tip (x2,y2)
    sw=2; h=4 if head else 0
    mid[0]+=1; mk=f'dc-arrow-head-filled-{mid[0]}'
    defs=f'<defs><marker id="{mk}" orient="auto" markerWidth="5" markerHeight="5" refX="2" refY="2" overflow="visible"><path d="M0 0 L4 2 L0 4 Z" fill="{LINE}" stroke="none" style="stroke: none; fill: {LINE}; fill: context-stroke"></path></marker></defs>' if head else ''
    me=f' marker-end="url(#{mk})"' if head else ''
    if y1==y2:
        x=min(x1,x2); n=abs(x2-x1)
        d=f'M 0 4 L {n-h} 4' if x2>x1 else f'M {n} 4 L {h} 4'
        box=f'left: {x}px; top: {y1-4}px; width: {n}px; height: 8px'; wh=(n,8)
    else:
        y=min(y1,y2); n=abs(y2-y1)
        d=f'M 4 0 L 4 {n-h}' if y2>y1 else f'M 4 {n} L 4 {h}'
        box=f'left: {x1-4}px; top: {y}px; width: 8px; height: {n}px'; wh=(8,n)
    arrows.append(f'<svg width="{wh[0]}" height="{wh[1]}" viewBox="0 0 {wh[0]} {wh[1]}" preserveAspectRatio="none" style="position: absolute; {box}; overflow: visible; fill: none; stroke: {LINE}; stroke-width: {sw}; stroke-linecap: round; stroke-linejoin: round">{defs}<path d="{d}"{me}></path></svg>')
MONO="'IBM Plex Mono', monospace"
def card(l,t,w,h,name,route='',prio='P0',body=None,align='center'):
    border={'P0':'1px solid #ff7a1a','P1':'1px solid #5c5c5c','P2':'1px dashed #5c5c5c','G':'1px solid #3a3a3a'}[prio]
    tag='' if prio=='G' else f' <span style="font: 600 10px {MONO}; color: {"#ff8a3d" if prio=="P0" else "#a3a3a3"};">{prio}</span>'
    if body is None:
        inner=f'<span><b style="font-size: 15px;">{name}</b>{tag}<br><span style="font: 12px {MONO}; color: #a3a3a3;">{route}</span></span>'
        flex='align-items: center; justify-content: center; text-align: center;'
    else:
        inner=f'<span><b style="font: 600 11px {MONO}; letter-spacing: 0.08em; color: #a3a3a3;">{name}</b><br>'+'<br>'.join(body)+'</span>'
        flex='align-items: flex-start; justify-content: flex-start; text-align: left; line-height: 21px; padding: 12px 14px;'
    cards.append(f'<div style="position: absolute; left: {l}px; top: {t}px; width: {w}px; height: {h}px; box-sizing: border-box; padding: 8px; display: flex; {flex} background: #262626; border: {border}; border-radius: 3px; color: #ececec; font-size: 13px; line-height: 18px;">{inner}</div>')
    return (l,t,w,h)
def p(s,pr='P0'):
    c={'P0':'#ececec','P1':'#a3a3a3','P2':'#959595'}[pr]
    return f'<span style="color: {c};">{s}</span>'
def m(s): return f'<span style="font-family: {MONO}; color: #959595;">{s}</span>'

# title + legend
labels.append(f'<div style="position: absolute; left: 64px; top: 56px; font-size: 32px; line-height: 40px; font-weight: 600; color: #ececec;">Server Planner — sitemap</div>')
labels.append(f'<div style="position: absolute; left: 64px; top: 100px; font-size: 14px; line-height: 20px; color: #a3a3a3;">Hash routes · source: docs/07-mapa-widokow.md · IDs match the document</div>')
card(2172,56,160,48,'MVP','','P0'); card(2348,56,160,48,'Later','','P1'); card(2524,56,212,48,'Optional','','P2')

# level 0
card(1080,180,240,72,'Projects','#/','P0')
# level 1
S=card(180,380,240,72,'Settings','#/settings','P0')
A=card(580,380,240,72,'About','#/about','P0')
P=card(1744,380,240,72,'Project editor','#/p/:id','P0')
seg(1200,252,1200,316); seg(300,316,1864,316)
for cx in (300,700,1864): seg(cx,316,cx,379,True)

# settings + about children (spine)
def stack(parent,spinex,childl,items):
    l,t,w,h=parent; tops=[]
    for i,(name,route,pr) in enumerate(items):
        ct=t+h+48+i*88; card(childl,ct,220,56,name,route,pr); tops.append(ct+28)
    seg(spinex,t+h,spinex,tops[-1])
    for y in tops: seg(spinex,y,childl-1,y,True)
stack(S,204,240,[('Appearance','/settings/appearance','P0'),('Catalog','/settings/catalog','P1'),('Units & costs','/settings/units','P1'),('Storage','/settings/storage','P0')])
stack(A,604,640,[('Overview','/about/overview','P0'),('Data sources','/about/data-sources','P0'),('Licenses','/about/licenses','P0')])

# project views
views=[('Topology','/topology','P0'),('Dashboard','/dashboard','P1'),('Inventory','/inventory','P1'),('IP Plan','/ip','P1'),('Access','/access','P1'),('Snapshots','/snapshots','P1'),('Services','/services','P2'),('Logical L3','/logical','P2')]
seg(1864,452,1864,516); seg(1122,516,2606,516)
for i,(n,r,pr) in enumerate(views):
    l=1032+i*212; card(l,580,180,72,n,r,pr); seg(l+90,516,l+90,579,True)

# topology groups
groups=[(1032,300,'RIGHT COLUMN · ?sel ?panel',[p('I-01 Project summary'),p('I-02 Device — Capacity · Hardware · Software · Network'),p('&#160;&#160;&#160;&#160;&#160;&#160;&#160;· Ports (switch)','P1'),p('I-03 Workload (VM · LXC · container)'),p('I-04 App · I-05 Link · I-06 Location'),p('I-07 Multi-selection · ')+p('I-08 Note','P1'),p('X-01 Simulation — Reachability · Access · ')+p('Flows','P1'),p('X-02 Issues')]),
        (1364,260,'DRAWERS · ?panel',[p('S-01 VLANs &amp; subnets'),p('S-02 Firewall rules'),p('S-03 Tags'),p('S-04 Project settings'),p('S-05 Assertions','P1')]),
        (1656,300,'DIALOGS',[p('D-04 Export'),p('D-05 Device model picker'),p('D-06 App catalog'),p('D-07 Add app wizard'),p('D-08 Suggest fix preview'),p('D-09 Keyboard shortcuts'),p('D-10 Catalog item update · D-11 Assertion','P1'),p('D-12 Snapshot · D-13 Command palette','P1'),p('D-14 Catalog changelog · D-15 Template','P1')]),
        (1988,300,'OVERLAYS &amp; STATES',[p('Project menu · Export menu'),p('Quick add · context menus'),p('Link drawing · drop preview (rack U)'),p('Tooltips · toasts · banners'),p('Simulation card · access overlays'),p('Zoom · legend · Group by · ')+p('minimap','P1'),p('Flow timeline','P1'),p('States: empty · loading · read-only','P0'),p('storage full · analysis failed · light')])]
seg(1122,652,1122,700); seg(1122,700,2138,700)
for l,w,name,body in groups:
    card(l,740,w,320,name,body=body,prio='G'); seg(l+w//2,700,l+w//2,739,True)
labels.append(f'<div style="position: absolute; left: 1134px; top: 668px; width: 96px; font-size: 13px; line-height: 16px; color: #959595;">in Topology</div>')

# projects dialogs (from root)
card(1400,180,300,72,'PROJECT DIALOGS',body=[p('D-01 New project · D-02 Import · D-03 Delete')],prio='G')
seg(1320,216,1399,216,True)

# outside tree band
els_bg.append('<div style="position: absolute; left: 64px; top: 1120px; width: 2672px; height: 216px; box-sizing: border-box; border: 1px dashed #3a3a3a; border-radius: 3px;"></div>')
labels.append(f'<div style="position: absolute; left: 80px; top: 1132px; font: 600 11px {MONO}; letter-spacing: 0.08em; color: #a3a3a3;">OUTSIDE THE TREE</div>')
card(96,1168,320,136,'NOT FOUND',body=[p('P-04 any unknown route'),p('or missing project id'),m('→ Back to projects')],prio='G')
card(448,1168,320,136,'DEV ONLY',body=[p('P-05 Component gallery'),m('#/dev/design'),p('both themes · visual tests')],prio='G')
card(800,1168,1000,136,'MOBILE &lt; 768 px · VIEW ONLY — same routes, different layout',body=[p('M-01 Projects list · M-02 Topology + read-only bottom sheet · M-03 Reachability (pick from lists)'),p('M-04 Issues (full screen) · M-06 Settings and About (one column)'),p('M-05 Inventory · IP Plan · Access as cards','P1')],prio='G')
card(1832,1168,872,136,'URL PARAMETERS (project views)',body=[m('?sel=dev_pve,lnk_3')+p(' selection · ')+m('?tab=hardware')+p(' inspector tab'),m('?panel=issues|sim|vlans|firewall:dev_rtr|tags|settings'),m('?sim=reach&amp;from=…&amp;to=…&amp;port=8096')+p(' shareable result')],prio='G')

html=f'''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Sitemap</title>
<script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&amp;family=IBM+Plex+Mono:wght@400;500;600&amp;display=swap" rel="stylesheet">
<style>
body{{margin:0}}
a{{color:#ff8a3d}}a:hover{{color:#ffb07a}}
</style>
</helmet>
<div style="position: relative; width: {W}px; height: {H}px; overflow: hidden; background: #171717; color: #ececec; font-family: 'IBM Plex Sans', system-ui, sans-serif;">
{chr(10).join(els_bg)}
{chr(10).join(arrows)}
{chr(10).join(cards)}
{chr(10).join(labels)}
</div>
</x-dc>
<script type="text/x-dc" data-dc-script data-props='{{"$preview":{{"width":{W},"height":{H}}}}}'>
class Component extends DCLogic {{
  renderVals() {{ return {{}}; }}
}}
</script>
</body>
</html>
'''
open(str(__import__('pathlib').Path(__file__).resolve().parent.parent/'canvas'/'project'/'Sitemap.dc.html'),'w').write(html)
