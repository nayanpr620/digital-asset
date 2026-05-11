import urllib.request, json
instances = [
    "https://pipedapi.tokhmi.xyz",
    "https://pipedapi.lunar.icu",
    "https://pipedapi.smnz.de",
    "https://api.piped.privacydev.net",
    "https://piped-api.garudalinux.org"
]
for base in instances:
    try:
        url = f"{base}/streams/gc119ZouWd4"
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=5) as r:
            data = json.loads(r.read())
            if 'videoStreams' in data:
                print(f"WORKED: {base}")
                break
    except Exception as e:
        print(f"Failed {base}: {e}")
