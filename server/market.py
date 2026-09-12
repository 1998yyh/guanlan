"""Normalize AKShare snapshots. Fetch time is not the exchange quote timestamp."""
import contextlib
import json
import math
import sys
with contextlib.redirect_stdout(sys.stderr):
    import akshare as ak
    frame = ak.stock_zh_a_spot_em()
rows = []
for _, row in frame.iterrows():
    try:
        item = dict(code=str(row['代码']).zfill(6), name=str(row['名称']),
                    price=float(row['最新价']), change=float(row['涨跌幅']),
                    turnover=float(row['换手率']), volumeRatio=float(row['量比']))
        if item['price'] > 0 and all(math.isfinite(item[k]) for k in ('price', 'change', 'turnover', 'volumeRatio')):
            rows.append(item)
    except (ValueError, TypeError):
        continue
print(json.dumps(rows, ensure_ascii=False, allow_nan=False))
