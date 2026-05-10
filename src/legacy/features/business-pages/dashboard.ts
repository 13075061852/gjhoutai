// @ts-nocheck

export const renderDashboard = () => `
    <section class="biz-dashboard-kpi-row">
      <article class="biz-dashboard-kpi kpi-orders">
        <div class="kpi-icon-wrap"><i class="ti ti-shopping-cart" aria-hidden="true"></i></div>
        <div class="kpi-body">
          <div class="kpi-label">今日订单</div>
          <div class="kpi-value">36<span class="kpi-unit"> 单</span></div>
          <div class="kpi-trend up"><i class="ti ti-trending-up" aria-hidden="true"></i>较昨日 +12%</div>
        </div>
      </article>
      <article class="biz-dashboard-kpi kpi-revenue">
        <div class="kpi-icon-wrap"><i class="ti ti-currency-yuan" aria-hidden="true"></i></div>
        <div class="kpi-body">
          <div class="kpi-label">今日营收</div>
          <div class="kpi-value">¥28.6<span class="kpi-unit">万</span></div>
          <div class="kpi-trend up"><i class="ti ti-trending-up" aria-hidden="true"></i>较昨日 +8.3%</div>
        </div>
      </article>
      <article class="biz-dashboard-kpi kpi-production">
        <div class="kpi-icon-wrap"><i class="ti ti-assembly" aria-hidden="true"></i></div>
        <div class="kpi-body">
          <div class="kpi-label">待排产批次</div>
          <div class="kpi-value">12<span class="kpi-unit"> 批</span></div>
          <div class="kpi-trend warn"><i class="ti ti-alert-triangle" aria-hidden="true"></i>4 批加急</div>
        </div>
      </article>
      <article class="biz-dashboard-kpi kpi-inventory">
        <div class="kpi-icon-wrap"><i class="ti ti-package" aria-hidden="true"></i></div>
        <div class="kpi-body">
          <div class="kpi-label">库存周转</div>
          <div class="kpi-value">8.4<span class="kpi-unit"> 天</span></div>
          <div class="kpi-trend up"><i class="ti ti-trending-up" aria-hidden="true"></i>周转加速 0.6天</div>
        </div>
      </article>
      <article class="biz-dashboard-kpi kpi-quality">
        <div class="kpi-icon-wrap"><i class="ti ti-checklist" aria-hidden="true"></i></div>
        <div class="kpi-body">
          <div class="kpi-label">质检通过率</div>
          <div class="kpi-value">97.8<span class="kpi-unit">%</span></div>
          <div class="kpi-trend up"><i class="ti ti-trending-up" aria-hidden="true"></i>+1.2%</div>
        </div>
      </article>
      <article class="biz-dashboard-kpi kpi-customer">
        <div class="kpi-icon-wrap"><i class="ti ti-users" aria-hidden="true"></i></div>
        <div class="kpi-body">
          <div class="kpi-label">活跃客户</div>
          <div class="kpi-value">28<span class="kpi-unit"> 家</span></div>
          <div class="kpi-trend up"><i class="ti ti-trending-up" aria-hidden="true"></i>新增 3 家</div>
        </div>
      </article>
    </section>

    <section class="biz-dashboard-workbench">
      <div class="biz-dashboard-primary">
        <article class="biz-dashboard-panel biz-chart-panel">
          <div class="biz-panel-head">
            <h2><i class="ti ti-chart-line" aria-hidden="true"></i>近7天订单趋势</h2>
            <div class="biz-panel-badges">
              <span class="biz-badge">本周</span>
              <span class="biz-badge is-active">上周</span>
            </div>
          </div>
          <div class="biz-chart-body">
            <div class="biz-chart-bars">
              ${[
                ['周一', 28, '#06b6d4'], ['周二', 32, '#0891b2'], ['周三', 36, '#0e7490'], ['周四', 31, '#06b6d4'], ['周五', 34, '#0891b2'], ['周六', 22, '#0e7490'], ['周日', 18, '#06b6d4'],
              ].map(([label, value, color]) => `
                <div class="biz-bar-col">
                  <div class="biz-bar-fill" style="height:${(Number(value)/40)*100}%;background:${color}"></div>
                  <span class="biz-bar-value">${value}</span>
                  <span class="biz-bar-label">${label}</span>
                </div>
              `).join('')}
            </div>
          </div>
        </article>

        <article class="biz-dashboard-panel biz-production-panel">
          <div class="biz-panel-head">
            <h2><i class="ti ti-chart-dots" aria-hidden="true"></i>生产状态概览</h2>
            <span class="biz-panel-meta">共追踪 24 批次</span>
          </div>
          <div class="biz-production-status-grid">
            <div class="biz-production-status-card">
              <div class="biz-status-icon running"><i class="ti ti-player-play-filled" aria-hidden="true"></i></div>
              <div class="biz-status-info">
                <strong>生产中</strong>
                <span class="biz-status-count">8 批</span>
                <div class="biz-status-bar"><div class="biz-status-fill" style="width:33%"></div></div>
              </div>
            </div>
            <div class="biz-production-status-card">
              <div class="biz-status-icon queued"><i class="ti ti-clock-filled" aria-hidden="true"></i></div>
              <div class="biz-status-info">
                <strong>待排产</strong>
                <span class="biz-status-count">12 批</span>
                <div class="biz-status-bar"><div class="biz-status-fill queued" style="width:50%"></div></div>
              </div>
            </div>
            <div class="biz-production-status-card">
              <div class="biz-status-icon review"><i class="ti ti-zoom-check-filled" aria-hidden="true"></i></div>
              <div class="biz-status-info">
                <strong>质检中</strong>
                <span class="biz-status-count">3 批</span>
                <div class="biz-status-bar"><div class="biz-status-fill review" style="width:12.5%"></div></div>
              </div>
            </div>
            <div class="biz-production-status-card">
              <div class="biz-status-icon done"><i class="ti ti-circle-check-filled" aria-hidden="true"></i></div>
              <div class="biz-status-info">
                <strong>已完成</strong>
                <span class="biz-status-count">1 批</span>
                <div class="biz-status-bar"><div class="biz-status-fill done" style="width:4%"></div></div>
              </div>
            </div>
          </div>
        </article>

        <section class="biz-dashboard-bottom-grid">
          <article class="biz-dashboard-panel biz-todo-panel">
            <div class="biz-panel-head">
              <h2><i class="ti ti-calendar-check" aria-hidden="true"></i>今日待办</h2>
              <span class="biz-panel-meta">3 项</span>
            </div>
            <div class="biz-todo-list">
              <div class="biz-todo-item urgent">
                <div class="biz-todo-check"><i class="ti ti-circle" aria-hidden="true"></i></div>
                <div class="biz-todo-body">
                  <strong>确认 GJ-PP-2308 加急订单交期</strong>
                  <span>美的集团 · 16:00 前</span>
                </div>
                <span class="biz-todo-tag">加急</span>
              </div>
              <div class="biz-todo-item">
                <div class="biz-todo-check"><i class="ti ti-circle" aria-hidden="true"></i></div>
                <div class="biz-todo-body">
                  <strong>复核 TGA 图谱异常样品报告</strong>
                  <span>实验室 · 18:00 前</span>
                </div>
                <span class="biz-todo-tag normal">正常</span>
              </div>
              <div class="biz-todo-item">
                <div class="biz-todo-check"><i class="ti ti-circle" aria-hidden="true"></i></div>
                <div class="biz-todo-body">
                  <strong>华东仓安全库存盘点核对</strong>
                  <span>仓库 · 明天上午</span>
                </div>
                <span class="biz-todo-tag normal">正常</span>
              </div>
            </div>
          </article>

          <article class="biz-dashboard-panel biz-recent-panel">
            <div class="biz-panel-head">
              <h2><i class="ti ti-clock-history" aria-hidden="true"></i>最近动态</h2>
              <span class="biz-panel-meta">实时更新</span>
            </div>
            <div class="biz-recent-list">
              <div class="biz-recent-item">
                <div class="biz-recent-line"></div>
                <div class="biz-recent-content">
                  <div class="biz-recent-time">15:42</div>
                  <strong>订单 ORD-0412 已完成生产</strong>
                  <span>PP 滑石粉填充 · 5000kg → 美的集团</span>
                </div>
              </div>
              <div class="biz-recent-item">
                <div class="biz-recent-line"></div>
                <div class="biz-recent-content">
                  <div class="biz-recent-time">15:18</div>
                  <strong>物性检测通过 — GJ-PP-2405 批次</strong>
                  <span>拉伸强度 32.5MPa · 冲击 8.2kJ/m²</span>
                </div>
              </div>
              <div class="biz-recent-item">
                <div class="biz-recent-line"></div>
                <div class="biz-recent-content">
                  <div class="biz-recent-time">14:55</div>
                  <strong>新增 2 家客户建档</strong>
                  <span>宁波XX塑业 · 温州XX电器</span>
                </div>
              </div>
              <div class="biz-recent-item">
                <div class="biz-recent-line"></div>
                <div class="biz-recent-content">
                  <div class="biz-recent-time">14:20</div>
                  <strong>原料入库 — 阻燃剂 FR-802</strong>
                  <span>供应商：XX化工 · 2000kg</span>
                </div>
              </div>
            </div>
          </article>
        </section>
      </div>

      <aside class="biz-dashboard-aside">
        <article class="biz-dashboard-panel biz-risk-panel">
          <div class="biz-panel-head">
            <h2><i class="ti ti-radar" aria-hidden="true"></i>风险雷达</h2>
            <span class="biz-panel-meta">5 项待处理</span>
          </div>
          <div class="biz-risk-list">
            <div class="biz-risk-item danger">
              <div class="biz-risk-dot"></div>
              <div class="biz-risk-body">
                <strong>交期压缩</strong>
                <span>GJ-PP-2308 等 4 个急单需插单评估</span>
              </div>
              <span class="biz-risk-count">4</span>
            </div>
            <div class="biz-risk-item danger">
              <div class="biz-risk-dot"></div>
              <div class="biz-risk-body">
                <strong>原料不足</strong>
                <span>黑色母库存低于安全线 35%</span>
              </div>
              <span class="biz-risk-count">2</span>
            </div>
            <div class="biz-risk-item warn">
              <div class="biz-risk-dot"></div>
              <div class="biz-risk-body">
                <strong>设备维护</strong>
                <span>双螺杆挤出机 #2 需月底检修</span>
              </div>
              <span class="biz-risk-count">1</span>
            </div>
            <div class="biz-risk-item info">
              <div class="biz-risk-dot"></div>
              <div class="biz-risk-body">
                <strong>复测等待</strong>
                <span>5 份物性报告待实验室确认签字</span>
              </div>
              <span class="biz-risk-count">5</span>
            </div>
            <div class="biz-risk-item info">
              <div class="biz-risk-dot"></div>
              <div class="biz-risk-body">
                <strong>物流延迟</strong>
                <span>华东线路因天气导致的 2 单延迟</span>
              </div>
              <span class="biz-risk-count">2</span>
            </div>
          </div>
        </article>

        <article class="biz-dashboard-panel biz-quick-actions-panel">
          <div class="biz-panel-head">
            <h2><i class="ti ti-bolt" aria-hidden="true"></i>快捷操作</h2>
          </div>
          <div class="biz-quick-actions-grid">
            <button class="biz-qk-btn" type="button" data-quick="order"><i class="ti ti-file-plus" aria-hidden="true"></i>新建订单</button>
            <button class="biz-qk-btn" type="button" data-quick="produce"><i class="ti ti-assembly" aria-hidden="true"></i>排产</button>
            <button class="biz-qk-btn" type="button" data-quick="quality"><i class="ti ti-checklist" aria-hidden="true"></i>质检录入</button>
            <button class="biz-qk-btn" type="button" data-quick="report"><i class="ti ti-file-spreadsheet" aria-hidden="true"></i>导出报表</button>
          </div>
        </article>
      </aside>
    </section>
  `;
