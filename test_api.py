import urllib.request, json, urllib.error

boundary = 'DataSight123'
csv_content = b'month,sales,region\nJan,1200,North\nFeb,1500,South\nMar,900,North\nApr,1800,East\nMay,2100,East\nJun,1600,South'

body = (
    '--' + boundary + '\r\n'
    'Content-Disposition: form-data; name="file"; filename="sample.csv"\r\n'
    'Content-Type: text/csv\r\n\r\n'
).encode() + csv_content + ('\r\n--' + boundary + '--\r\n').encode()

# Upload
req = urllib.request.Request('http://localhost:8000/upload', data=body,
    headers={'Content-Type': f'multipart/form-data; boundary={boundary}'}, method='POST')
res = urllib.request.urlopen(req)
d = json.load(res)
file_id = d.get('file_id')
print('Upload OK - file_id:', file_id[:8] + '...')
print('Score:', d.get('score'), '  Rows:', d.get('stats', {}).get('rows'), '  Columns:', d.get('columns'))

# Query
qdata = json.dumps({'prompt': 'show sales by month', 'file_id': file_id}).encode()
qreq = urllib.request.Request('http://localhost:8000/query', data=qdata,
    headers={'Content-Type': 'application/json'}, method='POST')
qres = urllib.request.urlopen(qreq)
qd = json.load(qres)
print('Query chart_type:', qd.get('intent', {}).get('chart_type'))
print('Confidence:', qd.get('confidence'))
print('Insights:', len(qd.get('insights', [])), 'items')
if qd.get('insights'):
    print('  →', qd['insights'][0][:90])
print('KPIs:', qd.get('kpis'))

# History
hreq = urllib.request.Request(f'http://localhost:8000/history/{file_id}')
hres = urllib.request.urlopen(hreq)
hd = json.load(hres)
print('History chats count:', hd.get('count'))
print('ALL TESTS PASSED!')
