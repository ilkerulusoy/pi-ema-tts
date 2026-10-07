import json
import sys

from ema_lightning import EMA

tts = EMA()
print("ready", flush=True)
for line in sys.stdin:
    job = json.loads(line)
    try:
        tts.say(job["text"], path=job["path"])
        print("ok", flush=True)
    except Exception as error:
        print("err " + str(error).replace("\n", " "), flush=True)
