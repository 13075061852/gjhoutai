/** This is deliberately a PREPARE-only tool. No model-accessible commit/delete endpoint. */
import { Type } from 'typebox';
const datasets = ['ash_records', 'office_records', 'spectrum_records', 'property_rows', 'report_ranges', 'inspection_reports'];
export function businessWriteTools(context = {}) {
  return [{
    name: 'prepare_business_change',
    label: '准备数据变更',
    description: '用户明确要求新增/修改/删除且目标、范围和必要字段确定时，同一轮查询后直接调用此工具准备确认卡片，不要先要求聊天二次确认。仅准备预览，用户点击卡片确认后才落库。支持灰份、送样/配色、图谱、物性主表/merged分表、报告判定范围和检测报告。先查询真实id和字段；目标有歧义、查询不完整或字段不足时先问，禁止猜测。修改只提供要变的字段，保留未要求修改的信息。若无需变更，不生成空卡片。准备不是写入成功。不能修改账户、权限、密钥、任意SQL或存储键。',
    promptSnippet: 'prepare_business_change: 准备业务数据增删改，用户确认后真实提交',
    parameters: Type.Object({
      dataset: Type.Union(datasets.map((name) => Type.Literal(name))),
      operation: Type.Union(['create', 'update', 'delete'].map((name) => Type.Literal(name))),
      sheet: Type.Optional(Type.String({ description: '物性行指定真实 merged 分表名，先查概况；不修改 raw 原始导入快照' })),
      items: Type.Array(Type.Object({
        id: Type.Optional(Type.String({ description: '修改/删除提供查询到的精确id；物性行用 rowRef。新增不传id。' })),
        data: Type.Optional(Type.Record(Type.String(), Type.Unknown(), { description: '灰份：date/name/batch/rows[{cupWeight,materialWeight,residueWeight,content}]；办事：type(sampling/coloring)/project/date/tableColumns/tableRows/target；图谱：title/code/spectrumType/category/date/tags/note；判定范围：model/metricKey/item/unit/range；报告：title/category/notes/fileName；物性：原表真实中文字段。日期YYYY-MM-DD。' })),
        attachmentId: Type.Optional(Type.String({ description: '新增图谱/检测报告需本会话图片/PDF附件id；文件不能任意读路径，不能覆盖原文件' })),
      }, { additionalProperties: false }), { minItems: 1, maxItems: 50 }),
    }, { additionalProperties: false }),
    async execute(_id, params, signal) {
      try {
        if (!context.cookie || !context.threadId) throw new Error('当前会话缺少写入身份，请重新发送问题');
        for (const item of params.items) {
          if (item.attachmentId && !context.attachmentIds?.includes(item.attachmentId)) throw new Error('只能保存本会话已上传的附件');
        }
        // Fixed loopback destination + existing authenticated session. Cookie never enters tool arguments / prompt.
        const response = await fetch('http://127.0.0.1:8788/api/business-actions/prepare', {
          method: 'POST',
          headers: { cookie: context.cookie, 'content-type': 'application/json' },
          body: JSON.stringify({ ...params, threadId: context.threadId }),
          signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(30_000)]) : AbortSignal.timeout(30_000),
        });
        const result = await response.json();
        if (!response.ok || !result.proposal?.id) throw new Error(result.error || '无法准备数据变更');
        const proposal = result.proposal;
        const summary = { id: proposal.id, dataset: proposal.dataset, operation: proposal.operation, count: proposal.count, status: 'awaiting_confirmation' };
        return { content: [{ type: 'text', text: JSON.stringify(summary) }], details: { proposal } };
      } catch (error) {
        return { content: [{ type: 'text', text: `准备变更失败：${error.message || '请重试'}` }], details: { error: true }, isError: true };
      }
    },
  }];
}
