import re, json, os
from pathlib import Path
D=str(Path(__file__).resolve().parent.parent/'canvas'/'project')+'/'
EDIT=open(D+'EditorDark.dc.html').read()
PROJ=open(D+'Projects.dc.html').read()
MOB=open(D+'Mobile.dc.html').read()
M="'IBM Plex Mono', monospace"; S="'IBM Plex Sans', sans-serif"
OK,WARN,ERR,INFO='#4ade80','#facc15','#ff4d4d','#5eaefc'
def one(s,old,new):
    assert s.count(old)==1,(old[:70],s.count(old)); return s.replace(old,new)
def title(s,t): return re.sub(r'<title>.*?</title>',f'<title>{t}</title>',s,count=1)
# ---------- primitives ----------
def lab(t,extra=''): return f'<span style="font: 600 11px {M}; letter-spacing: 0.08em; color: #a3a3a3;{extra}">{t}</span>'
def led(c,size=8): return f'<span style="width: {size}px; height: {size}px; flex-shrink: 0; border-radius: {size}px; background: {c}; box-shadow: 0 0 5px {c};"></span>'
def badge(t): return f'<span style="font: 600 10px {M}; color: #141414; background: #a3a3a3; padding: 1px 4px; border-radius: 2px;">{t}</span>'
def mono(t,c='#a3a3a3',size=12): return f'<span style="font: {size}px {M}; color: {c};">{t}</span>'
def btn(t,kind='secondary',h=32,extra=''):
    st={'primary':'background: #ff7a1a; color: #141414; border: 0; font-weight: 600;','secondary':'background: transparent; color: #ececec; border: 1px solid #3a3a3a; font-weight: 500;','ghost':'background: transparent; color: #ff8a3d; border: 0; font-weight: 500;','danger':'background: transparent; color: #ff6b6b; border: 1px solid #7f1d1d; font-weight: 500;'}[kind]
    return f'<button style="height: {h}px; padding: 0 12px; {st} border-radius: 3px; font-family: {S}; font-size: {13 if h>=32 else 12}px; white-space: nowrap;{extra}">{t}</button>'
def inp(v,m=False,w=''): return f'<input type="text" value="{v}" style="height: 32px; box-sizing: border-box; padding: 0 10px; background: #141414; border: 1px solid #3a3a3a; border-radius: 3px; color: #ececec; font: 13px {M if m else S};{w}">'
def sel(v,m=False,w=''): return f'<select style="height: 32px; padding: 0 8px; background: #141414; border: 1px solid #3a3a3a; border-radius: 3px; color: #ececec; font: 13px {M if m else S};{w}"><option>{v}</option></select>'
def field(label,control): return f'<label style="display: flex; flex-direction: column; gap: 6px;">{lab(label)}{control}</label>'
def tabs(names,active):
    out=[]
    for i,n in enumerate(names):
        a=(n==active)
        out.append(f'<span style="padding: 6px 0; text-align: center; {"background: #2a2a2a; font-weight: 500; border-bottom: 2px solid #ff7a1a;" if a else "color: #a3a3a3;"}">{n}</span>')
    return f'<div style="display: grid; grid-template-columns: repeat({len(names)}, minmax(0, 1fr)); border: 1px solid #2e2e2e; border-radius: 3px;">{"".join(out)}</div>'
def seg(names,active,fill=False):
    out=[]
    for i,n in enumerate(names):
        a=(n==active); last=i==len(names)-1
        bg=('background: #ff7a1a; color: #141414; font-weight: 600;' if fill else 'background: #2e2e2e; color: #ececec; font-weight: 500;') if a else 'background: transparent; color: #a3a3a3;'
        out.append(f'<button style="height: 28px; padding: 0 10px; {bg} border: 0; {"" if last else "border-right: 1px solid #3a3a3a;"} font-family: {S}; font-size: 12px;">{n}</button>')
    return f'<div style="display: inline-flex; border: 1px solid #3a3a3a; border-radius: 3px; overflow: hidden;">{"".join(out)}</div>'
def segbar(ok,warn=0,err=0,total=20,h=10):
    cells=[OK]*ok+[WARN]*warn+[ERR]*err+['#333']*(total-ok-warn-err)
    return f'<div style="display: grid; grid-template-columns: repeat({total}, minmax(0, 1fr)); gap: 2px;">'+''.join(f'<span style="height: {h}px; background: {c};"></span>' for c in cells)+'</div>'
def meter(label,val,ok,warn=0,err=0,vc='#a3a3a3',total=20):
    return f'<div style="display: flex; flex-direction: column; gap: 6px;"><div style="display: flex; justify-content: space-between;"><span>{label}</span>{mono(val,vc)}</div>{segbar(ok,warn,err,total)}</div>'
def kv(k,v,vc='#a3a3a3',m=True): return f'<div style="display: flex; justify-content: space-between; gap: 12px;"><span>{k}</span><span style="{"font-family: "+M+";" if m else ""} color: {vc}; text-align: right;">{v}</span></div>'
def sub(k,v): return f'<div style="display: flex; justify-content: space-between; padding-left: 12px; font-size: 12px; color: #a3a3a3;"><span>{k}</span><span style="font-family: {M};">{v}</span></div>'
def section(label,body,first=False): return f'<div style="display: flex; flex-direction: column; gap: 8px;{"" if first else " padding-top: 12px; border-top: 1px solid #2e2e2e;"}">{lab(label)}{body}</div>'
def tip(t,kind='warn'):
    c={'warn':('#2a2410','#6b5a12','#fde68a'),'info':('#13233a','#1e3a5f','#bfdbfe'),'neutral':('#242424','#3a3a3a','#c4c4c4')}[kind]
    return f'<div style="padding: 10px 12px; background: {c[0]}; border: 1px solid {c[1]}; border-radius: 3px; color: {c[2]}; font-size: 12px; line-height: 1.5;">{t}</div>'
def head(name,subt,crumb=None):
    cr=f'<span style="font: 12px {M}; color: #959595;">{crumb}</span>' if crumb else ''
    return f'<div style="display: flex; flex-direction: column; gap: 4px;">{cr}<span style="font-size: 18px; font-weight: 600;">{name}</span><span style="color: #a3a3a3;">{subt}</span></div>'
def col(*parts,gap=6): return f'<div style="display: flex; flex-direction: column; gap: {gap}px;">{"".join(parts)}</div>'
def row(*parts,gap=8,extra=''): return f'<div style="display: flex; align-items: center; gap: {gap}px;{extra}">{"".join(parts)}</div>'
SPACER='<div style="flex-grow: 1;"></div>'
def issue(c,text,target,code,fix=None):
    f=btn(fix,'ghost',28,' padding: 0;') if fix else ''
    return f'<div style="display: flex; gap: 10px; align-items: flex-start; padding: 10px 0; border-bottom: 1px solid #2e2e2e;"><span style="margin-top: 5px;">{led(c)}</span><div style="display: flex; flex-direction: column; gap: 3px; flex: 1;"><span>{text}</span><span style="font-size: 12px;"><a href="#">{target}</a> · {mono(code,"#959595",11)}</span>{f}</div></div>'
# ---------- editor composition ----------
ASIDE=f'<aside style="position: absolute; left: 976px; top: 52px; width: 304px; height: 748px; box-sizing: border-box; padding: 16px; background: #1c1c1c; border-left: 1px solid #2e2e2e; display: flex; flex-direction: column; gap: 14px; overflow: hidden;">'
def inspector(s,content):
    i=s.index('<!-- inspector: form factor -->'); j=s.index('</aside>',i)+len('</aside>')
    return s[:i]+'<!-- right column -->\n  '+ASIDE+content+'</aside>'+s[j:]
def overlay(s,html):
    k=s.rindex('\n</div>\n</x-dc>'); return s[:k]+'\n'+html+s[k:]
def scrim(): return '<div style="position: absolute; left: 0; top: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.55);"></div>'
def dialog(w,h,titl,body,footer,left=None,top=None):
    left=(1280-w)//2 if left is None else left; top=(800-h)//2 if top is None else top
    close='<button aria-label="Close" style="width: 32px; height: 32px; background: transparent; border: 0; color: #a3a3a3; font-size: 20px;">×</button>'
    return f'''<div role="dialog" aria-label="{re.sub('<.*?>','',titl)}" style="position: absolute; left: {left}px; top: {top}px; width: {w}px; height: {h}px; box-sizing: border-box; background: #1f1f1f; border: 1px solid #3a3a3a; border-radius: 3px; display: flex; flex-direction: column;">
<div style="height: 56px; flex-shrink: 0; box-sizing: border-box; padding: 0 12px 0 20px; display: flex; align-items: center; gap: 12px; border-bottom: 1px solid #2e2e2e;"><span style="font-size: 18px; font-weight: 600;">{titl}</span>{SPACER}{close}</div>
<div style="flex: 1; min-height: 0; display: flex; overflow: hidden;">{body}</div>
<div style="height: 60px; flex-shrink: 0; box-sizing: border-box; padding: 0 20px; display: flex; align-items: center; gap: 8px; border-top: 1px solid #2e2e2e;">{footer}</div>
</div>'''
def drawer(titl,subt,body):
    return scrim_canvas()+f'''<aside aria-label="{titl}" style="position: absolute; left: 560px; top: 52px; width: 720px; height: 748px; box-sizing: border-box; background: #1c1c1c; border-left: 1px solid #3a3a3a; display: flex; flex-direction: column;">
<div style="height: 64px; flex-shrink: 0; box-sizing: border-box; padding: 0 12px 0 20px; display: flex; align-items: center; gap: 12px; border-bottom: 1px solid #2e2e2e;"><div style="display: flex; flex-direction: column; gap: 2px;"><span style="font-size: 18px; font-weight: 600;">{titl}</span><span style="font-size: 12px; color: #a3a3a3;">{subt}</span></div>{SPACER}<button aria-label="Close" style="width: 32px; height: 32px; background: transparent; border: 0; color: #a3a3a3; font-size: 20px;">×</button></div>
<div style="flex: 1; box-sizing: border-box; padding: 16px 20px; display: flex; flex-direction: column; gap: 14px; overflow: hidden;">{body}</div></aside>'''
def scrim_canvas(): return '<div style="position: absolute; left: 232px; top: 52px; width: 1048px; height: 748px; background: rgba(0,0,0,0.45);"></div>'
def table(cols,rows,widths):
    gt=' '.join(widths)
    h=f'<div style="display: grid; grid-template-columns: {gt}; gap: 12px; padding: 8px 10px; border-bottom: 1px solid #3a3a3a; font: 600 11px {M}; letter-spacing: 0.06em; color: #a3a3a3;">'+''.join(f'<span>{c}</span>' for c in cols)+'</div>'
    body=''
    for r in rows:
        hl=r[0]=='!'; cells=r[1:] if hl else r
        body+=f'<div style="display: grid; grid-template-columns: {gt}; gap: 12px; align-items: center; padding: 9px 10px; border-bottom: 1px solid #2e2e2e;{" background: #2e2218; outline: 1px solid #ff7a1a;" if hl else ""}">'+''.join(f'<span>{c}</span>' for c in cells)+'</div>'
    return f'<div style="display: flex; flex-direction: column;">{h}{body}</div>'
def swatch(c): return f'<span style="display: inline-block; width: 18px; height: 6px; border-radius: 1px; background: {c}; vertical-align: middle;"></span>'
def act(a):
    c={'ALLOW':('#16301f','#4ade80'),'DENY':('#3a1414','#ff8080')}[a]
    return f'<span style="font: 600 10px {M}; padding: 2px 6px; border-radius: 2px; background: {c[0]}; color: {c[1]};">{a}</span>'
def chip(kind,text,l,t):
    c={'ok':('#16301f','#4ade80','#1f5132'),'part':('#2a2410','#facc15','#6b5a12'),'no':('#3a1414','#ff8080','#7f1d1d')}[kind]
    return f'<span style="position: absolute; left: {l}px; top: {t}px; height: 18px; padding: 0 6px; display: flex; align-items: center; background: {c[0]}; color: {c[1]}; border: 1px solid {c[2]}; border-radius: 2px; font: 600 10px {M};">{text}</span>'
def counters(s,e,w):
    i=s.index('<div style="display: flex; align-items: center; gap: 12px; font: 12px'); j=s.index('\n    </div>',i)+len('\n    </div>')
    c=f'<div style="display: flex; align-items: center; gap: 12px; font: 12px {M};"><span style="display: flex; align-items: center; gap: 6px; color: {"#ff6b6b" if e else "#959595"};">{led(ERR if e else "#333")}{e}</span><span style="display: flex; align-items: center; gap: 6px; color: {"#facc15" if w else "#959595"};">{led(WARN if w else "#333")}{w}</span></div>'
    return s[:i]+c+s[j:]
def select_gw(s):
    s=one(s,'background: #262626; border: 2px solid #ff7a1a; border-radius: 6px;','background: #262626; border: 1px solid #3a3a3a; border-radius: 6px;')
    return one(s,'border: 1px solid #ff4d4d; border-radius: 2px; display: flex;','border: 2px solid #ff7a1a; border-radius: 2px; display: flex;')
def no_selection(s): return one(s,'background: #262626; border: 2px solid #ff7a1a; border-radius: 6px;','background: #262626; border: 1px solid #3a3a3a; border-radius: 6px;')
def remove_simcard(s,replacement=''):
    i=s.index('<!-- simulation result -->'); j=s.index('<div style="position: absolute; right: 16px; bottom: 16px;',i)
    return s[:i]+replacement+'\n    '+s[j:]
def canvas_add(s,html):
    k=s.index('\n  </main>'); return s[:k]+'\n'+html+s[k:]
OUT={}
PVE_HEAD=head('pve1','Lenovo M720q · i5-8500T · 2 × 16 GB')
DEV_TABS=['Capacity','Hardware','Software','Network']

# 1. Device › Capacity
b=remove_simcard(EDIT)
c=PVE_HEAD+tabs(DEV_TABS,'Capacity')+row(lab('MODE'),SPACER,seg(['Allocated','Expected · P1'],'Allocated'))
c+=col(meter('CPU','5 / 24 vCPU',4),sub('docker-vm','2 vCPU'),sub('home-assistant','2 vCPU'),sub('unifi','1 vCPU'),mono('6 threads × 4:1 overcommit','#959595',11),gap=5)
c+=col(meter('Memory','22.4 / 28.8 GB',14,2,vc=WARN),sub('docker-vm','8 GB'),sub('ZFS ARC (max)','8 GB'),sub('home-assistant','4 GB'),sub('unifi','2 GB'),sub('Proxmox host','0.4 GB'),gap=5)
c+=col(meter('local-lvm','310 / 900 GB',7),sub('docker-vm disk','128 GB'),sub('ISO & templates','134 GB'),sub('home-assistant · unifi','48 GB'),gap=5)
c+=SPACER+tip('Memory above 70%. Both slots used — swap to 2 × 32 GB or move <strong>unifi</strong> to another host.')
OUT['MvpDeviceCapacity']=('I-02a Device › Capacity',title(inspector(b,c),'Device capacity'))

# 2. Device › Software
def wl(kind,name,res,children='',lv=OK):
    return f'<div style="display: flex; flex-direction: column; gap: 4px; padding: 8px 10px; background: #242424; border: 1px solid #333; border-radius: 3px;">{row(badge(kind),f"<span style=\"font-weight: 500;\">{name}</span>",SPACER,mono(res),led(lv,7))}{children}</div>'
def ct(name,info,st=False): return f'<div style="display: flex; gap: 8px; align-items: center; padding-left: 20px; font-size: 12px;">{badge("STACK" if st else "CT")}<span>{name}</span><span style="margin-left: auto; font-family: {M}; color: #959595;">{info}</span></div>'
c=PVE_HEAD+tabs(DEV_TABS,'Software')
c+=section('OPERATING SYSTEM',row(sel('Proxmox VE',w=' flex: 1;'),sel('8.3',True,' width: 72px;'))+mono('Host overhead · 1 core · 0.4 GB + ZFS ARC','#959595',11),True)
c+=section('DOCKER ON HOST',row('<span style="color: #a3a3a3; font-size: 12px; flex: 1;">Not recommended on Proxmox — use a VM or LXC.</span>',seg(['Off','On'],'Off')))
c+=section('WORKLOADS · 3',wl('VM','docker-vm','2c · 8G',ct('jellyfin',':8096')+ct('pihole',':53 :8080')+ct('immich','4 containers',True))+wl('LXC','home-assistant','2c · 4G')+wl('LXC','unifi','1c · 2G',lv=OK)+row(btn('Add VM','secondary',28),btn('Add LXC','secondary',28),btn('Add app','primary',28)))
OUT['MvpDeviceSoftware']=('I-02c Device › Software',title(inspector(remove_simcard(EDIT),c),'Device software'))

# 3. Device › Network (router)
c=head('gw-01','Generic router · 4 × 1G · rack 1U')+tabs(['Hardware','Network'],'Network')
ifrows=[('wan0','WAN','DHCP · ISP'),('lan0','trunk','10 · 20 · 30'),('&#160;&#160;lan0.10','Mgmt','192.168.10.1/24'),('&#160;&#160;lan0.20','LAN','192.168.20.1/24'),('&#160;&#160;lan0.30','IoT','192.168.30.1/24')]
ifs=''.join(f'<div style="display: grid; grid-template-columns: 74px 52px 1fr; gap: 8px; font-size: 12px; padding: 4px 0;"><span style="font-family: {M};">{a}</span><span style="color: #a3a3a3;">{bb}</span><span style="font-family: {M}; color: #a3a3a3; text-align: right;">{cc}</span></div>' for a,bb,cc in ifrows)
c+=section('INTERFACES',ifs,True)
c+=section('ROUTES',kv('0.0.0.0/0','via wan0 (DHCP)'))
c+=section('FIREWALL',kv('Rules','6 · default deny')+kv('Stateful','established allowed')+btn('Open firewall rules','secondary',32))
c+=section('NAT',kv('Masquerade','lan* → wan0')+kv('Port forwards','none'))
c+=SPACER+section('ISSUES',issue(ERR,'VLAN 30 not allowed on sw-core port 8','sw-core:8','VAL_03','Allow VLAN 30 on port 8'))
OUT['MvpDeviceNetwork']=('I-02d Device › Network (router)',title(inspector(select_gw(remove_simcard(EDIT)),c),'Device network'))

# 4. Workload
b=remove_simcard(EDIT)
vmrow="<div style=\"display: flex; gap: 8px; align-items: center;\"><span style=\"font: 600 10px 'IBM Plex Mono', monospace; color: #141414; background: #a3a3a3; padding: 1px 4px; border-radius: 2px;\">VM</span>"
b=one(b,vmrow,vmrow.replace('align-items: center;','align-items: center; margin: 0 -6px; padding: 2px 6px; background: #2e2218; outline: 1px solid #ff7a1a;'))
b=one(b,'border: 2px solid #ff7a1a; border-radius: 6px;','border: 1px solid #5c5c5c; border-radius: 6px;')
c=head('docker-vm','VM · Debian 12 · Docker','pve1 › docker-vm')+tabs(['Resources','Network','Containers'],'Resources')
c+=section('ALLOCATION',f'<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">{field("VCPU",inp("2",True))}{field("MEMORY",inp("8 GB",True))}</div>'+field('DISK · LOCAL-LVM',inp('128 GB',True)),True)
c+=section('APPS INSIDE VS ALLOCATION',meter('CPU (recommended)','1.6 / 2 vCPU',16)+meter('Memory (recommended)','6.1 / 8 GB',15,0)+meter('Disk','74 / 128 GB',12))
c+=section('NETWORK DEVICES',f'<div style="display: grid; grid-template-columns: 44px 1fr auto; gap: 8px; font-size: 12px; align-items: center;"><span style="font-family: {M};">net0</span><span style="color: #a3a3a3;">vmbr0 · tag 20 · virtio</span><span style="font-family: {M}; color: #ff6b6b;">192.168.20.15</span></div>'+mono('IP also used by nas-01 · VAL_05','#ff6b6b',11))
c+=SPACER+tip('Recursive check: apps need 6.1 GB at recommended settings — 1.9 GB headroom in this VM.','info')
OUT['MvpWorkload']=('I-03 Workload (VM)',title(inspector(b,c),'Workload'))

# 5. Drawer VLANs
rows=[[swatch('#c084fc'),mono('10','#ececec',13),'Mgmt',mono('192.168.10.0/24','#ececec'),mono('.1'),mono('off'),'Mgmt'],
      [swatch(INFO),mono('20','#ececec',13),'LAN',mono('192.168.20.0/24','#ececec'),mono('.1'),mono('.100–.199'),'LAN'],
      ['!',swatch('#f472b6'),mono('30','#ececec',13),'IoT',mono('192.168.30.0/24','#ececec'),mono('.1'),mono('.100–.250'),'IoT']]
body=row(seg(['VLANs','Zones'],'VLANs'),SPACER,mono('Native / untagged: VLAN 1','#959595'))
body+=table(['','VID','NAME','SUBNET','GW','DHCP','ZONE'],rows,['24px','40px','90px','150px','40px','100px','1fr'])
body+=btn('Add VLAN','secondary',32,' align-self: flex-start;')
det=f'<div style="display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px;">{field("NAME",inp("IoT"))}{field("VLAN ID",inp("30",True))}{field("COLOR",sel("pink"))}{field("SUBNET",inp("192.168.30.0/24",True))}{field("GATEWAY",inp("192.168.30.1",True))}{field("ZONE",sel("IoT"))}{field("DHCP RANGE",inp(".100 – .250",True))}{field("DNS",sel("pihole (app)"))}{field("DOMAIN",inp("iot.lan",True))}</div>'
body+=section('VLAN 30 · IOT',det)
body+=tip('3 devices use VLAN 30 · tv-salon, ap-living (SSID “Home-IoT”), sw-core port 8 (trunk — missing, see Issues).','neutral')
OUT['MvpDrawerVlans']=('S-01 VLANs & subnets',title(overlay(EDIT,drawer('VLANs & subnets','3 VLANs · 3 subnets · 4 zones',body)),'VLANs drawer'))

# 6. Drawer Firewall
grip='<span style="color: #5c5c5c; font-family: '+M+';">⋮⋮</span>'
rows=[[grip+mono(' 1','#ececec'),act('ALLOW'),'zone LAN','any',mono('any'),mono('12')],
      [grip+mono(' 2','#ececec'),act('ALLOW'),'zone IoT','app pihole',mono('udp/53'),mono('3')],
      [grip+mono(' 3','#ececec'),act('ALLOW'),'zone Mgmt','any',mono('any'),mono('0')],
      ['!',grip+mono(' 4','#ececec'),act('DENY'),'zone IoT','zone LAN',mono('any'),mono('1','#ff8080')],
      [grip+mono(' 5','#ececec'),act('ALLOW'),'zone IoT','Internet',mono('tcp/443'),mono('2')],
      [grip+mono(' 6','#ececec'),act('DENY'),'zone Guest','zones LAN, Mgmt',mono('any'),mono('0')]]
body=row(seg(['Rules','NAT','Routes'],'Rules'),SPACER,btn('Add rule','primary',28))
body+=table(['#','ACTION','SOURCE','DESTINATION','PROTO/PORT','HITS'],rows,['44px','64px','110px','1fr','90px','40px'])
body+=row(lab('DEFAULT POLICY'),SPACER,seg(['Allow','Deny'],'Deny',True),mono('stateful · established/related allowed','#959595',11),gap=12)
body+=section('RULE #4 · MATCHED BY',col(row(led(ERR,7),'<span>tv-salon → Jellyfin :8096</span>',SPACER,btn('Open in simulation','ghost',24,' padding: 0;')),mono('Hits = simulation tests and flows that stopped on this rule.','#959595',11)))
body+=tip('Rules are evaluated top to bottom; first match wins. Drag ⋮⋮ to reorder.','neutral')
b=select_gw(EDIT)
OUT['MvpDrawerFirewall']=('S-02 Firewall rules',title(overlay(b,drawer('Firewall rules · gw-01','6 rules · zones Mgmt, LAN, IoT, Guest, WAN',body)),'Firewall drawer'))

# 7. Issues panel
c=row('<button aria-label="Back to inspector" style="width: 28px; height: 28px; background: transparent; border: 1px solid #3a3a3a; border-radius: 3px; color: #ececec;">‹</button>','<span style="font-size: 18px; font-weight: 600;">Issues</span>')
c+=seg(['All · 3','Errors · 2','Warnings · 1'],'All · 3')+inp('Filter issues…',w=' width: 100%;')
c+=col(lab('ERRORS · 2'),issue(ERR,'VLAN 30 not allowed on sw-core port 8','sw-core:8','VAL_03','Fix: allow VLAN 30'),issue(ERR,'192.168.20.15 assigned twice','docker-vm net0 · nas-01','VAL_05','Fix: pick a free IP'),gap=0)
c+=col(lab('WARNINGS · 1'),issue(WARN,'pve1 memory at 78% (warning above 70%)','pve1','CAP_RAM'),gap=0)
c+=row(lab('IGNORED · 0'),SPACER,mono('▸','#959595'))
c+=SPACER+row(led(OK,7),mono('Analysed 12 ms ago · 4 rules · 31 checks','#959595',11))
OUT['MvpIssues']=('X-02 Issues panel',title(inspector(no_selection(remove_simcard(EDIT)),c),'Issues'))

# 8. Access overlays
legend=f'''<!-- access legend -->
    <div style="position: absolute; left: 40px; top: 476px; width: 300px; box-sizing: border-box; padding: 10px 12px; background: #1f1f1f; border: 1px solid #3a3a3a; border-radius: 3px; display: flex; flex-direction: column; gap: 8px;">
      {lab('INTERNET ACCESS')}
      <div style="display: flex; gap: 14px; font-size: 12px; color: #a3a3a3;"><span>✓ full</span><span>◐ partial</span><span>✕ none</span></div>
    </div>'''
b=remove_simcard(no_selection(EDIT),legend)
b=canvas_add(b,'\n'.join(['    '+chip('ok','✓',4,133),chip('ok','✓',4,159),chip('ok','✓',4,185),chip('no','✕',4,224),chip('ok','✓',648,150),chip('ok','✓',396,482),chip('part','◐ 443',560,480)]))
def svc(c,name,port,why): return f'<div style="display: grid; grid-template-columns: 10px 1fr auto; gap: 8px; align-items: start; padding: 6px 0; border-bottom: 1px solid #2e2e2e;"><span style="margin-top: 5px;">{led(c,7)}</span><span style="display: flex; flex-direction: column; gap: 2px;"><span>{name}</span><span style="font-size: 12px; color: #a3a3a3;">{why}</span></span>{mono(port)}</div>'
c=row('<button aria-label="Back to inspector" style="width: 28px; height: 28px; background: transparent; border: 1px solid #3a3a3a; border-radius: 3px; color: #ececec;">‹</button>','<span style="font-size: 18px; font-weight: 600;">Simulation</span>')
c+=tabs(['Reachability','Access','Flows'],'Access')
c+=section('OVERLAY',row('<span style="flex: 1;">Internet access</span>',seg(['Off','On'],'On',True))+row('<span style="flex: 1;">Visible from</span>',seg(['Off','On'],'On',True)),True)
c+=field('POINT OF VIEW',sel('tv-salon · IoT'))
c+=section('FROM TV-SALON · 2 OF 6 REACHABLE',svc(OK,'Pi-hole DNS','udp/53','rule #2')+svc(OK,'Internet (HTTPS)','tcp/443','rule #5 · NAT gw-01')+svc(ERR,'Jellyfin','tcp/8096','rule #4 IoT → LAN deny')+svc(ERR,'Home Assistant','tcp/8123','rule #4')+svc(ERR,'nas-01 SMB','tcp/445','rule #4')+svc(ERR,'Internet (other)','any','default deny'))
c+=SPACER+tip('nas-01 has no internet: no default gateway on its interface.','warn')
OUT['MvpAccess']=('X-01b Simulation › Access overlays',title(inspector(b,c),'Access overlays'))

# 9. App catalog dialog
cats=['All · 412','Media · 38','Photos · 9','Home automation · 21','Networking · 44','Monitoring · 30','Productivity · 61']
catl=''.join(f'<span style="padding: 7px 10px; border-radius: 3px; {"background: #2e2e2e; color: #ececec;" if i==2 else "color: #a3a3a3;"}">{x}</span>' for i,x in enumerate(cats))
def conf(k): return f'<span style="font: 600 10px {M}; padding: 1px 5px; border-radius: 2px; border: 1px solid #3a3a3a; color: {"#4ade80" if k=="curated" else "#a3a3a3"};">{k}</span>'
def appr(name,desc,req,k,state):
    st={'sel':'background: #2e2218; border: 1px solid #ff7a1a;','in':'background: #242424; border: 1px solid #333; opacity: 0.6;','':'background: #242424; border: 1px solid #333;'}[state]
    box={'sel':'<span style="width: 16px; height: 16px; border-radius: 2px; background: #ff7a1a; color: #141414; font-size: 12px; display: flex; align-items: center; justify-content: center;">✓</span>','in':mono('In project','#959595',11),'':'<span style="width: 16px; height: 16px; border-radius: 2px; border: 1px solid #5c5c5c;"></span>'}[state]
    return f'<div style="display: flex; gap: 12px; align-items: center; padding: 10px 12px; border-radius: 3px; {st}"><div style="display: flex; flex-direction: column; gap: 3px; flex: 1;"><span style="display: flex; gap: 8px; align-items: center;"><b>{name}</b>{conf(k)}</span><span style="font-size: 12px; color: #a3a3a3;">{desc}</span>{mono(req,"#959595",11)}</div>{box}</div>'
lst=appr('Immich','Self-hosted photo and video backup','4 containers · 2 vCPU · 4 GB · :2283','curated','sel')+appr('PhotoPrism','AI-powered photo app','1 container · 2 vCPU · 3 GB · :2342','imported','')+appr('Jellyfin','Media server','In this project on docker-vm','curated','in')+appr('Nextcloud','Files, calendar, contacts','3 containers · 2 vCPU · 2 GB · :443','curated','')+appr('Piwigo','Photo gallery','2 containers · 1 vCPU · 1 GB · :80','estimated','')
detail=col(row('<span style="font-size: 18px; font-weight: 600;">Immich</span>',conf('curated')),'<span style="color: #a3a3a3; line-height: 1.5;">High-performance self-hosted photo and video backup with ML search.</span>',
  section('STACK',''.join(f'<div style="display: flex; justify-content: space-between; font-size: 12px;"><span>{a}</span>{mono(bb,"#959595",11)}</div>' for a,bb in [('immich-server',':2283'),('immich-machine-learning','—'),('postgres','internal'),('redis','internal')])),
  section('REQUIREMENTS',kv('Minimum','2 vCPU · 4 GB')+kv('Recommended','4 vCPU · 6 GB')+kv('Storage','10 GB + photos')),
  section('TRAFFIC',mono('clients → :2283 · outbound HTTPS (ML models)','#a3a3a3',11)),
  section('SOURCES',mono('curated · awesome-selfhosted · LinuxServer','#959595',11)),gap=12)
body=f'<div style="width: 200px; flex-shrink: 0; box-sizing: border-box; padding: 16px 12px; border-right: 1px solid #2e2e2e; display: flex; flex-direction: column; gap: 2px;">{catl}</div><div style="flex: 1; box-sizing: border-box; padding: 16px; display: flex; flex-direction: column; gap: 8px; overflow: hidden;">{inp("photo",w=" width: 100%;")}{mono("5 results in Photos","#959595",11)}{lst}</div><div style="width: 300px; flex-shrink: 0; box-sizing: border-box; padding: 16px 20px; border-left: 1px solid #2e2e2e; overflow: hidden;">{detail}</div>'
foot=mono('1 selected · target: docker-vm (Docker)','#a3a3a3')+SPACER+btn('Cancel')+btn('Add 1 app','primary')
OUT['MvpAppCatalog']=('D-06 App catalog',title(overlay(EDIT,scrim()+dialog(1040,640,'App catalog',body,foot)),'App catalog'))

# 10. Add app wizard step 2
def step(n,t,st):
    c={'done':('#4ade80','#16301f'),'cur':('#141414','#ff7a1a'),'todo':('#a3a3a3','#2e2e2e')}[st]
    return f'<div style="display: flex; align-items: center; gap: 8px;"><span style="width: 22px; height: 22px; border-radius: 11px; background: {c[1]}; color: {c[0]}; font: 600 11px {M}; display: flex; align-items: center; justify-content: center;">{"✓" if st=="done" else n}</span><span style="{"font-weight: 600;" if st=="cur" else "color: #a3a3a3;"}">{t}</span></div>'
steps=row(step(1,'Where','done'),'<span style="flex: 1; height: 1px; background: #3a3a3a;"></span>',step(2,'Ports &amp; storage','cur'),'<span style="flex: 1; height: 1px; background: #3a3a3a;"></span>',step(3,'Network','todo'),gap=12)
prow=lambda h,cport,p,purp,warn=None: f'<div style="display: grid; grid-template-columns: 96px 16px 80px 64px 1fr; gap: 8px; align-items: center;">{inp(h,True," width: 96px;"+(" border-color: #ff4d4d;" if warn else ""))}<span style="color: #959595;">→</span>{mono(cport,"#ececec",13)}{mono(p)}<span style="font-size: 12px; color: #a3a3a3;">{purp}</span></div>'+(f'<span style="font-size: 12px; color: #ff6b6b; padding-left: 2px;">{warn}</span>' if warn else '')
vrow=lambda n,path,pool,size: f'<div style="display: grid; grid-template-columns: 1fr 120px 90px; gap: 8px; align-items: center;"><span style="display: flex; flex-direction: column; gap: 2px;"><span>{n}</span>{mono(path,"#959595",11)}</span>{sel(pool)}{inp(size,True," width: 90px;")}</div>'
body=f'<div style="flex: 1; box-sizing: border-box; padding: 20px; display: flex; flex-direction: column; gap: 18px;">{steps}'
body+=section('PORTS · HOST → CONTAINER',prow('2283',':2283','tcp','Web UI')+prow('8080',':3003','tcp','ML API (optional)','Port 8080 is used by pihole on docker-vm — use 8081?')+row(btn('Use 8081','secondary',28),btn('Do not publish','ghost',28)),True)
body+=section('VOLUMES',vrow('library','/usr/src/app/upload','nas-01 · tank','500 GB')+vrow('postgres','/var/lib/postgresql/data','local-lvm','10 GB')+vrow('model-cache','/cache','local-lvm','5 GB'))
body+=tip('docker-vm disk grows to 143 GB (local-lvm 34% → 36%). Library on nas-01 via NFS.','info')+'</div>'
foot=mono('Immich → docker-vm','#a3a3a3')+SPACER+btn('Back')+btn('Next: network','secondary')+btn('Add Immich','primary')
OUT['MvpAddApp']=('D-07 Add app wizard (step 2)',title(overlay(EDIT,scrim()+dialog(640,640,'Add app · Immich',body,foot)),'Add app'))

# 11. Device model picker
def chk(t,on=False): return f'<label style="display: flex; align-items: center; gap: 8px; font-size: 13px;"><span style="width: 14px; height: 14px; border-radius: 2px; {"background: #ff7a1a;" if on else "border: 1px solid #5c5c5c;"}"></span>{t}</label>'
filters=col(section('TYPE',chk('Mini PC',True)+chk('Tower')+chk('NAS')+chk('Rack server'),True),section('VENDOR',chk('Lenovo',True)+chk('HP',True)+chk('Dell',True)+chk('Intel NUC')+chk('Minisforum')),section('RAM MAX',sel('≥ 32 GB')),section('NETWORK',chk('2.5G or faster')+chk('2+ ports')),section('IDLE POWER',sel('≤ 15 W')),gap=12)
perf=lambda v,est=False: f'<span style="display: flex; align-items: center; gap: 6px;"><span style="width: 48px; height: 6px; background: #333; position: relative;"><span style="position: absolute; left: 0; top: 0; height: 6px; width: {min(v,200)/200*48:.0f}px; background: {OK};"></span></span>{mono(("≈" if est else "")+str(v),"#ececec")}</span>'
rows=[['!','<b>Lenovo M720q</b>',mono('i5-8500T · 6C/6T'),perf(100),mono('64 GB · 2'),mono('1 × 1G'),mono('11 W')],
      ['<b>Lenovo M920q</b>',mono('i5-8500T · 6C/6T'),perf(100),mono('64 GB · 2'),mono('1 × 1G'),mono('11 W')],
      ['<b>Lenovo M70q Gen 3</b>',mono('i5-12500T · 6C/12T'),perf(164),mono('64 GB · 2'),mono('1 × 1G'),mono('9 W')],
      ['<b>HP EliteDesk 800 G4 Mini</b>',mono('i5-8500T · 6C/6T'),perf(100),mono('32 GB · 2'),mono('1 × 1G'),mono('10 W')],
      ['<b>Dell OptiPlex 7070 Micro</b>',mono('i5-9500T · 6C/6T'),perf(108),mono('64 GB · 2'),mono('1 × 1G'),mono('10 W')],
      ['<b>Dell OptiPlex 3000 Thin</b>',mono('Pentium N6005 · 4C/4T'),perf(41,True),mono('16 GB · 2'),mono('1 × 1G'),mono('6 W')]]
res=f'<div style="flex: 1; box-sizing: border-box; padding: 16px; display: flex; flex-direction: column; gap: 10px; overflow: hidden;">{row(inp("tiny",w=" flex: 1;"),sel("Sort: relevance"))}{mono("6 models · perf: Blender Open Data, i5-8500T = 100 · ≈ estimated","#959595",11)}{table(["MODEL","CPU","PERF","RAM MAX · SLOTS","NIC","IDLE"],rows,["1.4fr","1.3fr","96px","110px","60px","44px"])}</div>'
body=f'<div style="width: 220px; flex-shrink: 0; box-sizing: border-box; padding: 16px; border-right: 1px solid #2e2e2e; overflow: hidden;">{filters}</div>{res}'
foot=mono('Lenovo M720q · catalog 2026.46 · copied into project','#a3a3a3')+SPACER+btn('Cancel')+btn('Use this model','primary')
b=EDIT
OUT['MvpModelPicker']=('D-05 Device model picker',title(overlay(b,scrim()+dialog(1120,640,'Choose device model · pve1',body,foot)),'Model picker'))

# 12. Empty canvas
b=counters(EDIT,0,0)
i=b.index('<!-- canvas -->'); m0=b.index('>',b.index('<main',i))+1; m1=b.index('\n  </main>')
empty=f'''
    <div style="position: absolute; left: 172px; top: 214px; width: 400px; display: flex; flex-direction: column; align-items: center; gap: 14px; text-align: center;">
      <div style="display: flex; gap: 16px; align-items: flex-end; color: #5c5c5c;">
        <svg width="72" height="72" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" aria-hidden="true"><rect x="4" y="2" width="16" height="20" rx="1"></rect><path d="M7 6h10M7 10h10M7 14h10M7 18h10"></path></svg>
        <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" aria-hidden="true"><rect x="3" y="9" width="18" height="7" rx="1.5"></rect><path d="M6 12.5h.01M5 19h3M16 19h3"></path></svg>
      </div>
      <span style="font-size: 24px; line-height: 32px; font-weight: 600;">Start your lab</span>
      <span style="color: #a3a3a3; line-height: 1.5;">Add a place for your hardware, then drop devices from the library. Connect ports to build the network.</span>
      <div style="display: flex; gap: 8px;">{btn('Add room')}{btn('Add rack')}{btn('Add device','primary')}</div>
      <a href="#">or start from a template</a>
    </div>
    <div style="position: absolute; right: 16px; bottom: 16px; display: flex; background: #1f1f1f; border: 1px solid #3a3a3a; border-radius: 3px;"><span style="width: 48px; height: 30px; display: flex; align-items: center; justify-content: center; font: 11px {M}; color: #a3a3a3;">100%</span></div>'''
b=b[:m0]+empty+b[m1:]
c=head('New lab','Project · created just now')+section('THIS PROJECT',kv('Devices','0')+kv('Locations','0')+kv('VLANs','0')+kv('Apps','0'),True)
c+=section('QUICK START',col(btn('Add device','secondary',32,' width: 100%;'),btn('Manage VLANs','secondary',32,' width: 100%;'),btn('Project settings','secondary',32,' width: 100%;')))
c+=SPACER+tip('Tip: double-click the canvas to search the library. Press ? for shortcuts.','neutral')
b=inspector(b,c).replace('Home lab</span>','New lab</span>',1)
OUT['MvpEmptyCanvas']=('T-02 Empty canvas',title(b,'Empty canvas'))

# 13. First run
p0=PROJ.index('<main'); p1=PROJ.index('</main>')+len('</main>')
fr=f'''<main style="flex: 1; display: flex; align-items: center; justify-content: center;">
    <div style="width: 520px; display: flex; flex-direction: column; align-items: center; gap: 16px; text-align: center;">
      <div style="display: flex; gap: 16px; align-items: flex-end; color: #5c5c5c;">
        <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" aria-hidden="true"><rect x="4" y="2" width="16" height="20" rx="1"></rect><path d="M7 6h10M7 10h10M7 14h10M7 18h10"></path></svg>
        <svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="1.5"></rect><path d="M7.5 7v10M12 7v10M16.5 7v10"></path></svg>
        <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" aria-hidden="true"><rect x="3" y="9" width="18" height="7" rx="1.5"></rect><path d="M6 12.5h.01M5 19h3M16 19h3"></path></svg>
      </div>
      <h1 style="margin: 0; font-size: 24px; line-height: 32px; font-weight: 600;">Plan your home lab</h1>
      <p style="margin: 0; color: #a3a3a3; line-height: 1.5;">Draw your devices and network, check if your hardware can run your apps, and see what can reach what. Everything stays in this browser.</p>
      <div style="display: flex; gap: 8px;">{btn('Import JSON')}{btn('Try example project')}{btn('New project','primary')}</div>
      <span style="font: 12px {M}; color: #959595;">Catalog 2026.46 · 412 apps · 180 devices · offline-ready</span>
    </div>
  </main>'''
OUT['MvpFirstRun']=('T-01 First run',title(PROJ[:p0]+fr+PROJ[p1:],'First run'))

# 14. New project dialog
def opt(t,d,on=False): return f'<div style="display: flex; gap: 12px; padding: 12px; border-radius: 3px; {"background: #2e2218; border: 1px solid #ff7a1a;" if on else "background: #242424; border: 1px solid #333;"}"><span style="margin-top: 2px; width: 14px; height: 14px; border-radius: 7px; box-sizing: border-box; {"border: 4px solid #ff7a1a;" if on else "border: 1px solid #5c5c5c;"}"></span><span style="display: flex; flex-direction: column; gap: 3px;"><b>{t}</b><span style="font-size: 12px; color: #a3a3a3;">{d}</span></span></div>'
body=f'<div style="flex: 1; box-sizing: border-box; padding: 20px; display: flex; flex-direction: column; gap: 16px;">{field("PROJECT NAME",inp("Home lab 2027"))}{lab("START WITH")}<div style="display: flex; flex-direction: column; gap: 8px; margin-top: -8px;">{opt("Empty","Blank canvas.")}{opt("Template","Mini PC + router · Proxmox 3-node · IoT segmentation",True)}<div style="display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; padding-left: 26px;">'+''.join(f'<span style="padding: 8px; border-radius: 3px; font-size: 12px; text-align: center; {"border: 1px solid #ff7a1a; color: #ececec;" if i==0 else "border: 1px solid #3a3a3a; color: #a3a3a3;"}">{t}</span>' for i,t in enumerate(['Mini PC + router','Proxmox 3-node · P1','IoT segmentation · P1']))+f'</div>{opt("Example project","The sample lab from the docs, with issues to explore.")}</div></div>'
foot=SPACER+btn('Cancel')+btn('Create project','primary')
OUT['MvpNewProject']=('D-01 New project',title(overlay(PROJ,scrim()+dialog(560,520,'New project',body,foot)),'New project'))

# 15. Export dialog
prev='<div style="height: 150px; border: 1px solid #2e2e2e; border-radius: 3px; background-color: #171717; background-image: linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px); background-size: 12px 12px; position: relative;"><span style="position: absolute; left: 30px; top: 22px; width: 70px; height: 100px; border: 1px solid #5c5c5c; background: #1b1b1b;"></span><span style="position: absolute; left: 130px; top: 22px; width: 110px; height: 56px; border: 1px dashed #5c5c5c;"></span><span style="position: absolute; left: 140px; top: 34px; width: 60px; height: 30px; background: #262626; border: 1px solid #3a3a3a; border-radius: 4px;"></span><span style="position: absolute; left: 130px; top: 92px; width: 110px; height: 34px; border: 1px dashed #5c5c5c;"></span></div>'
body=f'<div style="flex: 1; box-sizing: border-box; padding: 20px; display: flex; flex-direction: column; gap: 16px;">{row(lab("FORMAT"),SPACER,seg(["PNG","SVG","JSON"],"PNG",True))}{prev}{row(lab("AREA"),SPACER,seg(["Whole canvas","Selection"],"Whole canvas"))}{row(lab("THEME"),SPACER,seg(["Dark","Light","Transparent"],"Light"))}{row(lab("SCALE"),SPACER,seg(["1×","2×","3×"],"2×"))}{row(lab("INCLUDE"),SPACER,seg(["Issue markers","Legend"],"Legend"))}{mono("home-lab.png · 3840 × 2240 px · ≈ 1.2 MB","#959595",11)}</div>'
foot=mono('JSON = full project backup','#959595',11)+SPACER+btn('Cancel')+btn('Export PNG','primary')
OUT['MvpExport']=('D-04 Export',title(overlay(EDIT,scrim()+dialog(520,560,'Export',body,foot)),'Export'))

# 16/17 Settings & About
hdr=PROJ[:PROJ.index('<main')]
def page(nav,active,content,ttl):
    navh=''.join(f'<a href="#" style="display: block; padding: 8px 12px; border-radius: 3px; text-decoration: none; {"background: #2a2a2a; color: #ececec; font-weight: 500; box-shadow: inset 2px 0 0 #ff7a1a;" if n==active else "color: #a3a3a3;"}">{n}</a>' for n in nav)
    return hdr+f'''<main style="flex: 1; min-height: 0; display: flex;">
    <nav aria-label="{ttl}" style="width: 240px; flex-shrink: 0; box-sizing: border-box; padding: 24px 16px; border-right: 1px solid #2e2e2e; display: flex; flex-direction: column; gap: 2px;">
      <span style="font-size: 18px; font-weight: 600; padding: 0 12px 12px;">{ttl}</span>{navh}
    </nav>
    <div style="flex: 1; box-sizing: border-box; padding: 32px 48px; display: flex; flex-direction: column; gap: 24px; max-width: 900px;">{content}</div>
  </main>'''+PROJ[PROJ.index('</main>')+len('</main>'):]
card=lambda t,d,ctrl: f'<div style="display: flex; gap: 24px; align-items: center; padding: 16px; background: #1c1c1c; border: 1px solid #2e2e2e; border-radius: 3px;"><div style="display: flex; flex-direction: column; gap: 4px; flex: 1;"><b>{t}</b><span style="color: #a3a3a3; font-size: 12px; line-height: 1.5;">{d}</span></div>{ctrl}</div>'
st=f'<h1 style="margin: 0; font-size: 24px; line-height: 32px;">Storage</h1>'
st+=col(row('<span>Browser storage used</span>',SPACER,mono('412 KB of ~2 GB available','#a3a3a3')),segbar(1,total=40),gap=8)
st+=card('Persistent storage','Not granted. The browser may clear your projects when disk space runs low.',row(led(WARN),btn('Request persistence','primary')))
st+=card('Backups','Last export 21 days ago · 3 projects. A JSON export is a complete backup of a project.',btn('Export all projects'))
st+=card('Catalog cache','Version 2026.46 and 2026.45 are kept for rollback · 2.1 MB.',btn('Clear older version'))
st+=f'<div style="display: flex; flex-direction: column; gap: 10px; padding: 16px; border: 1px solid #7f1d1d; border-radius: 3px;">{lab("DANGER ZONE","color: #ff6b6b;")}<div style="display: flex; gap: 24px; align-items: center;"><span style="flex: 1; color: #a3a3a3; font-size: 12px;">Delete all projects, snapshots and settings from this browser. This cannot be undone.</span>{btn("Delete all data","danger")}</div></div>'
OUT['MvpSettings']=('P-02d Settings › Storage',title(page(['Appearance','Catalog','Units &amp; costs','Storage'],'Storage',st,'Settings'),'Settings'))
rows=[['<b>awesome-selfhosted-data</b>','App list, descriptions, tags','CC BY-SA 3.0',mono('Nov 9')],['<b>Proxmox VE Community Scripts</b>','Default CPU / RAM / disk','MIT',mono('Nov 9')],['<b>LinuxServer.io API</b>','Ports, volumes, architectures','facts only',mono('Nov 9')],['<b>Docker Hub</b>','Tags, architectures, sizes','Docker terms',mono('Nov 9')],['<b>Blender Open Data</b>','CPU and GPU performance','license-free',mono('Nov 9')],['<b>Wikidata</b>','CPU specifications','CC0',mono('Nov 9')],['<b>Server Planner curated</b>','Traffic patterns, devices, CPUs','CC BY-SA 4.0',mono('2026.46')]]
ab=f'<h1 style="margin: 0; font-size: 24px; line-height: 32px;">Data sources</h1><p style="margin: 0; color: #a3a3a3; line-height: 1.5;">The catalog is rebuilt at most once a week by a GitHub Actions workflow and published with the app. The catalog as a whole is licensed CC BY-SA 4.0 and includes data from awesome-selfhosted (CC BY-SA 3.0, see its AUTHORS file).</p>'
ab+=table(['SOURCE','USED FOR','LICENSE','FETCHED'],rows,['1.3fr','1.4fr','120px','80px'])
ab+=card('Recommended','selfh.st — a living directory of self-hosted apps. Not used as a data source.',btn('Open selfh.st'))
OUT['MvpAbout']=('P-03b About › Data sources',title(page(['Overview','Data sources','Licenses'],'Data sources',ab,'About'),'About'))

# 18/19 Mobile
mh=MOB[:MOB.index('<!-- canvas')]
mend='\n</div>\n</x-dc>'+MOB[MOB.index('\n</div>\n</x-dc>')+len('\n</div>\n</x-dc>'):]
mh1=mh.replace('<span style="font-weight: 600;">Home lab</span>','<span style="font-weight: 600;">Server Planner</span>')
mh1=re.sub(r'<button style="height: 44px; padding: 0 6px;.*?</button>','',mh1,count=1,flags=re.S)
mh1=re.sub(r'<button aria-label="2 errors.*?</button>','',mh1,count=1,flags=re.S)
def mcard(n,meta,ed,c,cnt): return f'<a href="#" style="display: flex; align-items: center; gap: 12px; min-height: 64px; padding: 12px 14px; background: #1c1c1c; border: 1px solid #3a3a3a; border-radius: 3px; color: #ececec; text-decoration: none;"><div style="display: flex; flex-direction: column; gap: 3px; flex: 1;"><b>{n}</b>{mono(meta,"#a3a3a3",11)}<span style="font-size: 12px; color: #959595;">{ed}</span></div><span style="display: flex; align-items: center; gap: 5px; font: 11px {M}; color: {c};">{led(c,7)}{cnt}</span></a>'
m1=f'''<main style="position: absolute; left: 0; top: 52px; width: 390px; height: 792px; box-sizing: border-box; padding: 20px 16px; background: #141414; display: flex; flex-direction: column; gap: 12px;">
    <h1 style="margin: 0; font-size: 24px; line-height: 32px;">Projects</h1>
    {tip('View only on phones. Editing is available on desktop.','info')}
    {mcard('Home lab','8 devices · 3 locations','Edited 2 hours ago',ERR,2)}{mcard('Proxmox cluster plan','5 devices · 1 location','Edited 3 days ago',OK,0)}{mcard('IoT segmentation','3 devices · unplaced','Edited Oct 28',WARN,3)}
    <button style="height: 44px; background: transparent; color: #ececec; border: 1px solid #3a3a3a; border-radius: 3px; font: 500 13px {S};">Open JSON file to view</button>
    {SPACER}<span style="font: 12px {M}; color: #959595; text-align: center;">Catalog 2026.46 · stored in this browser</span>
  </main>'''
OUT['MvpMobileProjects']=('M-01 Mobile › Projects',title(mh1+m1+mend,'Mobile projects'),(390,844))
mstep=lambda n,l,t,s2,c: f'<div style="display: grid; grid-template-columns: 16px 40px 1fr 10px; gap: 8px; align-items: start; padding: 10px 0; border-bottom: 1px solid #2e2e2e;{" opacity: 0.45;" if c=="#333" else ""}">{mono(str(n),"#959595",11)}{badge(l)}<span style="display: flex; flex-direction: column; gap: 2px;"><span>{t}</span><span style="font-size: 12px; color: #a3a3a3;">{s2}</span></span><span style="margin-top: 5px;">{led(c)}</span></div>'
m3=f'''<main style="position: absolute; left: 0; top: 52px; width: 390px; height: 792px; box-sizing: border-box; padding: 16px; background: #1c1c1c; display: flex; flex-direction: column; gap: 14px;">
    {row('<span style="font-size: 18px; font-weight: 600;">Reachability</span>')}
    {field('FROM',sel('tv-salon · IoT',w=' height: 44px;'))}{field('TO',sel('Jellyfin · docker-vm',w=' height: 44px;'))}
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">{field('PROTOCOL',sel('TCP',True,' height: 44px;'))}{field('PORT',inp('8096',True,' height: 44px;'))}</div>
    <button style="height: 44px; background: #ff7a1a; color: #141414; border: 0; border-radius: 3px; font: 600 13px {S};">Run</button>
    <div style="border: 1px solid #3a3a3a; border-radius: 3px;"><div style="padding: 8px 12px; background: #3a1414; display: flex; align-items: center; gap: 8px; font: 600 11px {M}; letter-spacing: 0.06em; color: #ff8080;">{led(ERR)}BLOCKED AT STEP 4</div><div style="padding: 8px 12px; font-size: 12px; color: #a3a3a3;">gw-01 · rule #4 IoT → LAN deny</div></div>
    <div>{mstep(1,'DNS','jellyfin.lan → .20.15','pihole · rule #2',OK)}{mstep(2,'L2','tv-salon → ap → sw-core','VLAN 30',OK)}{mstep(3,'L3','gw-01 30.0/24 → 20.0/24','inter-VLAN',OK)}{mstep(4,'FW','Rule #4 IoT → LAN deny','first match',ERR)}{mstep(5,'APP','jellyfin :8096','not reached','#333')}</div>
    {SPACER}<span style="font-size: 12px; color: #959595; text-align: center;">Fixes can be applied on desktop.</span>
  </main>'''
OUT['MvpMobileReach']=('M-03 Mobile › Reachability',title(mh+m3+mend,'Mobile reachability'),(390,844))

# write files + index
idx=json.load(open(D+'canvas.json'))
rows_layout=[['MvpDeviceCapacity','MvpDeviceSoftware','MvpDeviceNetwork','MvpWorkload'],
             ['MvpDrawerVlans','MvpDrawerFirewall','MvpIssues','MvpAccess'],
             ['MvpAppCatalog','MvpAddApp','MvpModelPicker'],
             ['MvpEmptyCanvas','MvpFirstRun','MvpNewProject','MvpExport'],
             ['MvpSettings','MvpAbout','MvpMobileProjects','MvpMobileReach']]
y=5764
for r in rows_layout:
    x=0; hmax=0
    for k in r:
        v=OUT[k]; w,h=(v[2] if len(v)>2 else (1280,800))
        open(D+k+'.dc.html','w').write(v[1].replace('"$preview":{"width":1280,"height":800}',f'"$preview":{{"width":{w},"height":{h}}}'))
        idx['boards'][k+'.dc.html']={"x":x,"y":y,"w":w,"h":h,"title":v[0]}
        if k+'.dc.html' not in idx['order']: idx['order'].append(k+'.dc.html')
        x+=w+80; hmax=max(hmax,h)
    y+=hmax+120
idx['notes']['heading5']={"x":0,"y":5464,"text":"MVP mockups — docs/07 § 10 (rows = order 1–6)","kind":"title1","maxW":5360}
json.dump(idx,open(D+'canvas.json','w'),indent=2)
print(len(OUT),'boards; last y',y)
