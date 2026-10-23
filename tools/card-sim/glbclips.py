import sys, json, struct
data = sys.stdin.buffer.read()
ln = struct.unpack('<I', data[12:16])[0]
j = json.loads(data[20:20+ln])
for a in j.get('animations', []):
    mx = 0
    for s in a['samplers']:
        acc = j['accessors'][s['input']]
        if 'max' in acc: mx = max(mx, acc['max'][0])
    print(f"{a.get('name')}\t{mx:.2f}s")
