import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const src=readFileSync(new URL('../outreach-postcall.js',import.meta.url),'utf8');
test('completion shows Continue and Overview only on successful save',()=>{
 assert.match(src,/function showCompletion\(result,activityId\)/);
 assert.match(src,/id="shFeedbackContinue">Continue/);
 assert.match(src,/id="shFeedbackOverview">Overview/);
 assert.ok(src.indexOf('showCompletion(result,savedActivityId)') > src.indexOf('drafts=drafts.filter'));
});
test('exact activity IDs link browser and regular call saves to overview',()=>{
 assert.match(src,/savedActivityId=activity.id/);
 assert.match(src,/savedActivityId=activityId/);
 assert.match(src,/\.eq\('id',detail.activityId\)/);
 assert.match(src,/\.eq\('call_activity_id',activity.id\)/);
 assert.match(src,/\.eq\('call_sid',activity.call_sid\)/);
});
test('overview enforces signed-in associate ownership on each resource',()=>{
 assert.match(src,/\.eq\('user_id',auth.user.id\)\.single\(\)/);
 assert.match(src,/\.eq\('crm_id',detail.crmId\)\.eq\('user_id',auth.user.id\)/);
 assert.match(src,/This saved call is unavailable to your account/);
});
test('failed saves preserve questionnaire answers',()=>{
 assert.match(src,/captureAnswers\(\)/);
 assert.match(src,/Your answers are still here/);
});
