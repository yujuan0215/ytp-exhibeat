import json
d = json.load(open('/mnt/c/Programming/Project/ytp-exhibeat/exhibitions.json', encoding='utf-8'))
item = d[0]
print("Top-level keys:", list(item.keys()))
if item.get('showInfo'):
    print("showInfo[0] keys:", list(item['showInfo'][0].keys()))
    print("Sample showInfo[0]:", {k: item['showInfo'][0][k] for k in list(item['showInfo'][0].keys())[:8]})
print()
print("Sample top-level values:")
for k, v in item.items():
    if k != 'showInfo':
        print(f"  {k}: {repr(str(v)[:100])}")
