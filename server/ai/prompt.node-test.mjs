import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildSystemPrompt } from './prompt.mjs';

test('allows general questions without treating the platform as a topic boundary', () => {
  const prompt = buildSystemPrompt();
  assert.match(prompt, /通用 AI 助手/);
  assert.match(prompt, /平台是你的工作环境，不是你的知识或话题边界/);
  assert.match(prompt, /游戏、科技、生活、学习、写作/);
  assert.match(prompt, /题外话无需读取平台表格/);
});

test('requires proactive verification of unfamiliar or ambiguous public topics', () => {
  const prompt = buildSystemPrompt();
  assert.match(prompt, /不熟悉或拿不准的外部事物/);
  assert.match(prompt, /必须先联网检索公开资料/);
  assert.match(prompt, /搜索不需要用户再说「去搜」或额外确认/);
  assert.match(prompt, /不能先凭印象罗列猜测/);
  assert.match(prompt, /普通寒暄、写作、翻译、确定性计算/);
});

test('asks for one precise query instead of near-duplicate parallel searches', () => {
  const prompt = buildSystemPrompt();
  assert.match(prompt, /先构造一次精准查询/);
  assert.match(prompt, /不要并行发出多个近义重复的关键词/);
  const headings = prompt.split('\n').filter((line) => line.startsWith('## '));
  assert.deepEqual(headings, ['## 主动查证与联网搜索（必须遵守）', '## 香港服务器三个项目权限（真实工具已接入）', '## 平台页面与可查数据（先知道有什么，再回答有没有）', '## 图谱类型核验（登记信息不等于图像识别）', '## 平台内部数据纪律（仅约束内部业务事实，不限制通用问答）', '## 数据隔离与来源安全', '## 附件、图片与文件的输出方式', '## 输出方式', '## 当前环境']);
});

test('knows the platform pages and requires the spectrum tool before claiming a chart is missing', () => {
  const prompt = buildSystemPrompt();
  assert.match(prompt, /图谱分析/);
  assert.match(prompt, /FTIR\/TGA\/DSC/);
  assert.match(prompt, /必须先用 list_spectrum_records 查图谱库/);
  assert.match(prompt, /七个页面的数据都属于你的职责范围|平台就七个页面/);
});

test('maps every platform page to a tool and stays honest about what tools cannot read', () => {
  const prompt = buildSystemPrompt();
  for (const page of ['物性分析', '图谱分析', '检测报告', '办事记录', '配置中心', '主题设置']) {
    assert.ok(prompt.includes(page), `prompt should mention ${page}`);
  }
  for (const tool of [
    'data_overview', 'query_property_rows', 'query_sheet_rows', 'query_report_ranges',
    'list_spectrum_records', 'list_inspection_reports', 'list_office_records', 'list_ash_records',
  ]) {
    assert.ok(prompt.includes(tool), `prompt should route data domains to ${tool}`);
  }
  assert.match(prompt, /检测报告 PDF 正文/);
  assert.match(prompt, /谱图图片像素只能通过 read_spectrum_image 读取/);
  assert.match(prompt, /工具没有返回的内部信息/);
});

test('explains how to handle attachments and return images or files', () => {
  const prompt = buildSystemPrompt();
  assert.match(prompt, /服务器已读出/);
  assert.match(prompt, /只有【以下文件只有文件名，服务器无法解析其内容】区块/);
  assert.match(prompt, /用 Markdown 图片直接展示/);
  assert.match(prompt, /只能引用工具真实返回的地址/);
  assert.match(prompt, /每张图片的替代文字必须写工具返回的完整图谱名称和日期/);
  assert.match(prompt, /名称只是原登记名称，不是类型核验依据/);
});

test('verifies spectra from pixels and axes, never from a DSC filename or stored type alone', () => {
  const prompt = buildSystemPrompt();
  assert.match(prompt, /spectrumType\/registeredType、标题和文件名都是登记信息，可能误标/);
  assert.match(prompt, /read_spectrum_image 获取真实图片/);
  assert.match(prompt, /先按型号查询全部登记类型/);
  assert.match(prompt, /上方失重曲线加下方微分负峰属于TGA\/DTG/);
  assert.match(prompt, /热流\/Heat Flow（mW、W\/g等）/);
  assert.match(prompt, /不能把DTG通道当热流通道/);
  assert.match(prompt, /登记为某类型（尚未核验图像）/);
  assert.match(prompt, /登记为DSC，但图片显示TGA\/DTG特征/);
  assert.match(prompt, /不要自动修改记录/);
  assert.match(prompt, /DSC、TGA、FTIR只要各有可用图片，就必须各展示一张/);
  assert.match(prompt, /不能用两张FTIR挤掉DSC/);
  assert.match(prompt, /工具spectrumGallery已从全量匹配记录中按类型选好/);
});

test('never advertises modules the platform does not have', () => {
  const prompt = buildSystemPrompt();
  assert.match(prompt, /没有订单、库存、供应商、客户、配方、人员档案、权限管理等页面/);
  for (const dead of ['query_platform_records', 'platform_settings', 'list_platform_users', 'list_recognition_records']) {
    assert.ok(!prompt.includes(dead), `${dead} must not be advertised to the model`);
  }
});

test('preserves private-data boundaries and honest attribution, without requiring tools for every number', () => {
  const prompt = buildSystemPrompt({ user: { username: 'tester', department: '测试部' } });
  assert.match(prompt, /仅约束内部业务事实，不限制通用问答/);
  assert.match(prompt, /不要把内部记录、用户信息、密钥/);
  assert.match(prompt, /提供实际返回的可点击来源链接/);
  assert.match(prompt, /不声称查证了没有查证的内容/);
  assert.match(prompt, /prepare_business_change/);
  assert.match(prompt, /原prepare_business_change能力已经撤销/);
  assert.match(prompt, /用户必须点击界面按钮/);
  assert.match(prompt, /不能修改账号、权限、密钥/);
  assert.match(prompt, /不可启动、关闭、重启/);
  assert.match(prompt, /必须先调用 list_server_projects/);
  assert.match(prompt, /当前用户：tester（测试部）/);
  assert.doesNotMatch(prompt, /所有数字、型号、批号、时间都必须来自工具返回结果/);
});
