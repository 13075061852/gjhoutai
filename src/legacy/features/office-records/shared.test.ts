import { expect, it } from 'vitest';
import { createOfficeUi, decorateOfficeMarkup } from './shared';
it('decorates only retained office dialog button variants',()=>{
 const html=decorateOfficeMarkup('<button class="biz-inventory-primary-btn">保存</button><button class="biz-inventory-ghost-btn">取消</button><button class="is-danger">删除</button>');
 expect(html).toContain('ui-button ui-button--primary');expect(html).toContain('ui-button biz-inventory-ghost-btn');expect(html).toContain('ui-button ui-button--danger');
});
it('provides search markup without retired ERP table/stat renderers',()=>{
 const ui=createOfficeUi({App:{},utils:{escapeHtml:(v)=>String(v)},render:()=>{}});
 expect(ui.renderSearchBox({placeholder:'搜索记录'})).toContain('搜索记录');
 expect(ui).not.toHaveProperty('renderTable');expect(ui).not.toHaveProperty('renderStatStrip');
});
