(()=>{'use strict';
const table=document.getElementById('myLeadsTableBody'),shell=document.querySelector('.my-table-scroller');if(!table||!shell)return;
const list=document.createElement('div');list.className='ml-mobile-list';list.id='mlMobileCards';list.setAttribute('aria-label','Assigned leads');shell.after(list);
const read=(row,selector)=>row.querySelector(selector)?.textContent?.trim()||'';
const make=(tag,cls,value)=>{const el=document.createElement(tag);el.className=cls;if(value!==undefined)el.textContent=value;return el};
function render(){const rows=[...table.querySelectorAll('tr[data-row-id]')],fragment=document.createDocumentFragment();
if(!rows.length)fragment.append(make('p','ml-mobile-empty',table.textContent.trim()||'No leads to show.'));
for(const row of rows){
 const card=make('article','ml-mobile-card'),origin=row.querySelector('[data-select-row]');
 const check=make('input','ml-mobile-check');check.type='checkbox';check.checked=!!origin?.checked;check.setAttribute('aria-label','Select '+read(row,'.company-name'));check.addEventListener('change',()=>{if(!origin)return;origin.checked=check.checked;origin.dispatchEvent(new Event('change',{bubbles:true}));});card.append(check);
 card.append(make('span','ml-mobile-avatar',read(row,'.company-avatar')||'•'));
 const info=make('div','ml-mobile-info');info.append(make('div','ml-mobile-name',read(row,'.company-name')));
 const contact=read(row,'.contact-name'),title=read(row,'.contact-sub');if(contact||title)info.append(make('div','ml-mobile-contact',[contact,title].filter(Boolean).join(' · ')));
 const phone=read(row,'.phone-main');if(phone&&phone!=='No phone'){const link=make('a','ml-mobile-phone','☎ '+phone);link.href='tel:'+phone.replace(/[^+\d]/g,'');info.append(link);}
 const loc=[read(row,'.location-main'),read(row,'.location-time')].filter(Boolean).join(' · ');if(loc)info.append(make('div','ml-mobile-location','⌖ '+loc));card.append(info);
 const menu=make('button','ml-mobile-menu','⋮');menu.type='button';menu.setAttribute('aria-label','Lead actions for '+read(row,'.company-name'));menu.addEventListener('click',()=>row.querySelector('[data-open-menu]')?.click());card.append(menu);
 const pills=make('div','ml-mobile-pills');row.querySelectorAll('.data-pill').forEach(p=>pills.append(p.cloneNode(true)));card.append(pills);fragment.append(card);
}list.replaceChildren(fragment);}
let scheduled=false;const schedule=()=>{if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;render();});};
new MutationObserver(schedule).observe(table,{childList:true,subtree:true,attributes:true,attributeFilter:['checked']});render();
})();
