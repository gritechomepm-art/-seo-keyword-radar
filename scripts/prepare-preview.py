from pathlib import Path
import shutil,json
root=Path(__file__).resolve().parents[1]
(root/'dist').mkdir(exist_ok=True)
for name in ['index.html','styles.css','app.js','radar-core.js','radar-sheets.js','xlsx-export.js','radar.svg']:
    shutil.copy2(root/name,root/'dist'/name)
(root/'.openai').mkdir(exist_ok=True)
(root/'.openai/hosting.json').write_text(json.dumps({'static':{'directory':'dist'}}))
