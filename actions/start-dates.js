'use strict';
window.SteadyHandsStartDates = (() => {
  function parse(value) {
    if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))throw new Error('Invalid start date');
    const date=new Date(value+'T12:00:00Z');
    if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==value)throw new Error('Invalid start date');
    return date;
  }
  function todayKey(zone) {
    const parts=new Intl.DateTimeFormat('en-US',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
    return ['year','month','day'].map(k=>parts.find(p=>p.type===k).value).join('-');
  }
  function limitDate(from) {
    const d=parse(from), day=d.getUTCDate();
    d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+4);
    const last=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();
    d.setUTCDate(Math.min(day,last));return d.toISOString().slice(0,10);
  }
  function options(day,current,today) {
    parse(current);const end=limitDate(today);const out=[];
    if(!Number.isInteger(day)||day<1||day>5)return out;
    for(let d=parse(today);d.toISOString().slice(0,10)<=end;d.setUTCDate(d.getUTCDate()+1)){
      const key=d.toISOString().slice(0,10);
      if(d.getUTCDay()===day&&key>current)out.push(key);
    }
    return out;
  }
  async function load(){
    const {assignment,associate}=await window.OutreachActions.load();
    if(!assignment||assignment.status!=='assigned'||associate.current_basis!=='hourly')throw new Error('This action is not available.');
    parse(associate.start_date);return associate.start_date;
  }
  async function save(previous,next){
    parse(next);
    if(!options(parse(next).getUTCDay(),previous,todayKey('America/Los_Angeles')).includes(next))throw new Error('Choose a later weekday within the next four months');
    return window.OutreachActions.extend(window.outreachAssignmentId,previous,next);
  }
  return {parse,todayKey,limitDate,options,load,save};
})();
