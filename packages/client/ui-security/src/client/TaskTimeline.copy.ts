/** Locale-owned copy for the task activity preview. */
export const timelineEn = {
  timelinePlanner: 'Planner', timelineWorker: 'Worker', timelineOwner: 'Owner', timelineSystem: 'System', timelinePlanning: 'Planning', timelineReady: 'Ready', timelineCancelled: 'Cancelled', timelineInterrupted: 'Interrupted', timelineNeedsInput: 'Needs input',

  timelineAsset: 'Asset',timelineReview: 'Review',timelineExecution: 'Execution',timelineMessage: 'Message',timelineRefresh: 'Refresh',timelineError: 'Could not refresh activity. Previously loaded records remain visible. Try refreshing again.',timelineLoading: 'Loading activity…',timelineNoRecords: 'No recorded activity yet.',timelineElapsed: '{days} days ago',timelineTimestamp: 'Timestamp',timelineAssets: 'Assets',timelineUpstream: 'Upstream · Origin',timelineDownstream: 'Downstream · Produced',timelinePayload: 'Stored payload',

  timelineSearch: 'Search content / source / node ID', timelineAll: 'All', timelineGoal: 'Goal', timelineIntent: 'Intent', timelineFact: 'Fact', timelineFinding: 'Finding', timelineHint: 'Hint', timelineCompact: 'Compaction', timelineNewest: 'Newest first', timelineOldest: 'Oldest first', timelineAuto: 'Auto refresh', timelinePaused: 'Refresh paused', timelineRefreshNote: 'Preview only · Auto refresh does not fetch data', timelineDate: 'July 26, 2026 · Sample activity', timelineEmpty: 'No activity matches your filters.', timelineDetail: 'Sample record · No tools were executed. This event illustrates the task activity layout.',
  timelineTitle1: 'Review administration features and API authorization', timelineTitle2: 'Administration authentication configuration requires review', timelineTitle3: 'Review access boundaries for the order API', timelineTitle4: 'Administration authentication review completed', timelineTitle5: 'Prioritize authentication and exposed settings', timelineTitle6: 'Public API endpoint identified', timelineTitle7: 'Identify publicly exposed services for acme.com', timelineTitle8: 'Earlier investigation notes summarized', timelineAccepted: 'Accepted', timelineRecorded: 'Recorded', timelineCategory: 'Activity type', timelineSource: 'Source', timelineNode: 'Node',
}
/** Japanese task activity dictionary. */
export const timelineJa: Record<keyof typeof timelineEn, string> = {
  timelinePlanner: 'プランナー', timelineWorker: 'ワーカー', timelineOwner: 'ユーザー', timelineSystem: 'システム', timelinePlanning: '計画中', timelineReady: '準備完了', timelineCancelled: '中止', timelineInterrupted: '中断', timelineNeedsInput: '入力待ち',

  timelineAsset: '資産',timelineReview: '再計画',timelineExecution: '実行',timelineMessage: '会話',timelineRefresh: '更新',timelineError: '活動を更新できませんでした。取得済みの記録を表示しています。もう一度更新してください。',timelineLoading: '活動を読み込み中…',timelineNoRecords: '活動はまだ記録されていません。',timelineElapsed: '{days}日前',timelineTimestamp: '日時',timelineAssets: '対象資産',timelineUpstream: '上流・この記録の元',timelineDownstream: '下流・この記録から発生',timelinePayload: '保存データ',

  timelineSearch: '内容・発信元・ノードIDで検索', timelineAll: 'すべて', timelineGoal: '目標', timelineIntent: '調査', timelineFact: '事実', timelineFinding: '脆弱性', timelineHint: 'ヒント', timelineCompact: '要約', timelineNewest: '新しい順', timelineOldest: '古い順', timelineAuto: '自動更新', timelinePaused: '更新停止中', timelineRefreshNote: 'UIプレビュー · 自動更新によるデータ取得は行いません', timelineDate: '2026年7月26日 · サンプル履歴', timelineEmpty: '条件に一致する活動はありません。', timelineDetail: 'サンプル記録 · ツールは実行していません。タスクの活動履歴を示す表示例です。',
  timelineTitle1: '管理画面の機能とAPIの認可を確認', timelineTitle2: '管理画面の認証設定に確認が必要', timelineTitle3: '注文APIのアクセス範囲を確認', timelineTitle4: '管理画面の認証確認が完了', timelineTitle5: '認証と公開設定の確認を優先', timelineTitle6: '公開APIのエンドポイントを識別', timelineTitle7: 'acme.comの公開サービスを把握', timelineTitle8: 'これまでの調査メモを要約', timelineAccepted: '採用済み', timelineRecorded: '記録済み', timelineCategory: '活動の種類', timelineSource: '発信元', timelineNode: 'ノード',
}
/** Chinese task activity dictionary. */
export const timelineZh: Record<keyof typeof timelineEn, string> = {
  timelinePlanner: '规划器', timelineWorker: '工作器', timelineOwner: '用户', timelineSystem: '系统', timelinePlanning: '规划中', timelineReady: '准备就绪', timelineCancelled: '已取消', timelineInterrupted: '已中断', timelineNeedsInput: '等待输入',

  timelineAsset: '资产',timelineReview: '重新规划',timelineExecution: '执行',timelineMessage: '会话',timelineRefresh: '刷新',timelineError: '无法刷新活动。保留显示已加载的记录，请重试。',timelineLoading: '正在加载活动…',timelineNoRecords: '暂无活动记录。',timelineElapsed: '{days}天前',timelineTimestamp: '时间',timelineAssets: '相关资产',timelineUpstream: '上游 · 来源',timelineDownstream: '下游 · 产生',timelinePayload: '保存数据',

  timelineSearch: '搜索内容 / 来源 / 节点 ID', timelineAll: '全部', timelineGoal: '目标', timelineIntent: '意图', timelineFact: '事实', timelineFinding: '漏洞', timelineHint: '提示', timelineCompact: '压缩', timelineNewest: '最新在前', timelineOldest: '最早在前', timelineAuto: '自动刷新', timelinePaused: '刷新已暂停', timelineRefreshNote: '界面预览 · 自动刷新不会获取数据', timelineDate: '2026年7月26日 · 示例活动', timelineEmpty: '没有符合筛选条件的活动。', timelineDetail: '示例记录 · 未执行任何工具。此事件仅用于展示任务活动界面。',
  timelineTitle1: '检查后台功能与 API 授权', timelineTitle2: '后台认证配置需要检查', timelineTitle3: '检查订单 API 的访问边界', timelineTitle4: '后台认证检查已完成', timelineTitle5: '优先检查认证与公开配置', timelineTitle6: '已识别公开 API 接口', timelineTitle7: '识别 acme.com 对外暴露的服务', timelineTitle8: '汇总此前的调查记录', timelineAccepted: '已采纳', timelineRecorded: '已记录', timelineCategory: '活动类型', timelineSource: '来源', timelineNode: '节点',
}
