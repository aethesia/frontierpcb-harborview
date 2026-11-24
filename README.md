# FrontierPCB Harbor Viewer

FrontierPCB 评测结果与智能体执行轨迹的交互式浏览网站，支持查看评测批次、任务、试验详情和模型对比，以及搜索、筛选和分页浏览。

网站收录 5 个批次、549 条实际试验、489 份 Harbor ATIF 轨迹，以及原始日志、验证结果和 PCB 附件。轨迹和日志按需加载。

评测指标包括 pass@1、avg@3、pass@3 和 Average Time。Average Time 使用有效 agent 时间；超时按 8 小时计入。GPT 缺失的 1 条样本计入总分母 550，保留缺失状态，不生成虚构轨迹。单路批次不展示三路指标。

网站通过 GitHub 登录，仅允许获准账号访问。评测内容供浏览与对比，不提供上传、删除或启动评测的操作。

页面基于 Harbor 0.23.0 Viewer 修改，许可证见 `HARBOR-LICENSE` 和 `THIRD_PARTY_NOTICES.md`。
