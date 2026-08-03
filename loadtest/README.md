# 本地公开读接口压测脚本

本脚本只针对公开读取接口进行本机冒烟压测，不模拟真实生产流量，也不处理登录、预约、下单或支付写操作。

```powershell
Set-Location "C:\Users\Jie\Documents\博物馆"
.\loadtest\smoke-read-load.ps1 -Concurrency 10 -RequestsPerWorker 10
```

输出总请求数、成功率、P50、P95 和最大响应时间。课程 N-04 的具体并发和 P95 门槛尚未写入仓库，因此结果只能作为本地基线，不能宣称达到高并发指标。
