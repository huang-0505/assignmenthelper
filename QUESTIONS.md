# 题目改写

100 道技术题使用简单英文：ML 40 道、AI/LLM 30 道、SQL 20 道、Python 10 道。另改写 5 种项目追问。题目编号、难度、评分要点和 SQL 参考答案保持原样。

先说背景，再说要完成什么。SQL 写明输出、时间范围、重复记录和 NULL 的处理要求。Python 写明输入字段和输出。保留必要术语，不在题干中给解题方法。

例如，Python 第 7 题原来没有说清楚是返回用户还是交易。现在明确要求：保留交易金额高于该用户交易金额中位数的交易行，与原评分要点一致。

只更新尚未作答的当天题目。已作答题目保留原题干，方便回看。BQ 故事题不变。

## 参考资料

这些资料用于核对知识点和清楚的表达方式。题目是本项目自行改写的，不是从下面的网站逐题复制。

- [Google ML Crash Course exercises](https://developers.google.com/machine-learning/crash-course/exercises)：分类、过拟合、特征处理与上线评估。
- [scikit-learn common pitfalls](https://scikit-learn.org/stable/common_pitfalls.html)：数据泄漏与训练、测试数据的边界。
- [PostgreSQL window functions](https://www.postgresql.org/docs/current/tutorial-window.html)：按组排序、排名与累计计算。
- [pandas merging guide](https://pandas.pydata.org/docs/user_guide/merging.html)：连接键、重复行与连接检查。
- [Python default arguments](https://docs.python.org/3/tutorial/controlflow.html#default-argument-values)：可变默认参数。
- [Anthropic contextual retrieval](https://www.anthropic.com/engineering/contextual-retrieval)：文档检索与上下文。
