(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.GenevieveCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const SEVERITY = { green: 0, yellow: 1, amber: 2, red: 3, black: 4 };
  const WORKFLOW = ['detected', 'assigned', 'accepted', 'actioned', 'outcome_recorded', 'reviewed', 'closed'];

  const rank = level => SEVERITY[level] ?? 0;
  const highest = levels => (levels || []).reduce((a,b) => rank(b) > rank(a) ? b : a, 'green');
  const nowIso = () => new Date().toISOString();
  const uid = (prefix='evt') => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;

  function dueState(dueAt, currentTime=Date.now()) {
    if (!dueAt) return 'none';
    const due = new Date(dueAt).getTime();
    if (!Number.isFinite(due)) return 'none';
    const difference = due - currentTime;
    if (difference < 0) return 'overdue';
    if (difference <= 60 * 60 * 1000) return 'due_soon';
    return 'on_track';
  }

  function missingEvidence(obligation) {
    const required = Array.isArray(obligation.requiredEvidence) ? obligation.requiredEvidence : [];
    const supplied = new Set((obligation.evidence || []).map(item => item.type));
    return required.filter(type => !supplied.has(type));
  }

  function canClose(obligation) {
    return missingEvidence(obligation).length === 0 && Boolean(obligation.outcome && obligation.outcome.trim());
  }

  function nextStage(stage) {
    const index = WORKFLOW.indexOf(stage);
    return index < 0 || index >= WORKFLOW.length - 1 ? stage : WORKFLOW[index + 1];
  }

  function calculatePracticeState(state) {
    if (!state) return {level:'green', reason:'No active demo state'};
    const obligations = state.obligations || [];
    const incidents = state.incidents || [];
    const checks = state.checks || [];
    const hazards = state.whsHazards || [];
    const insurance = state.insurance || [];
    const supervision = state.supervision || [];

    const black = incidents.find(i => i.status !== 'closed' && i.level === 'black');
    if (black) return {level:'black', reason:`Emergency pathway active: ${black.title}`};

    const urgent = incidents.find(i => i.status !== 'closed' && i.level === 'red') ||
      obligations.find(o => o.status !== 'closed' && rank(o.level) >= 3 && (!o.ownerId || dueState(o.dueAt)==='overdue' || !['accepted','actioned','outcome_recorded','reviewed','closed'].includes(o.stage))) ||
      hazards.find(h => h.status !== 'closed' && h.residualLevel === 'red');
    if (urgent) return {level:'red', reason:urgent.title || urgent.hazard || 'Urgent psychology-practice safety item requires ownership'};

    const incompleteCheck = checks.some(group => group.required && group.items.some(item => item.required && !item.done));
    const overdue = obligations.find(o => o.status !== 'closed' && dueState(o.dueAt)==='overdue');
    const amberIncident = incidents.find(i => i.status !== 'closed' && i.level === 'amber');
    const amberHazard = hazards.find(h => h.status !== 'closed' && h.residualLevel === 'amber');
    const evidenceGap = obligations.find(o => o.status !== 'closed' && o.stage === 'reviewed' && missingEvidence(o).length);
    const insuranceGap = insurance.find(i => i.required && i.status !== 'current');
    const supervisionGap = supervision.find(s => s.status !== 'complete' && dueState(s.dueAt)==='overdue');
    if (overdue || amberIncident || amberHazard || evidenceGap || incompleteCheck || insuranceGap || supervisionGap) {
      const reason = overdue?.title || amberIncident?.title || amberHazard?.hazard || evidenceGap?.title || insuranceGap?.type || supervisionGap?.title || 'Required psychology practice safety check incomplete';
      return {level:'amber', reason};
    }

    const watch = obligations.find(o => o.status !== 'closed' && o.level === 'yellow');
    return watch ? {level:'yellow', reason:watch.title} : {level:'green', reason:'All current demo responsibilities are owned and on track'};
  }

  function continuityState(client, obligations) {
    const active = (obligations || []).filter(o => o.clientId === client.id && o.status !== 'closed');
    const levels = active.map(o => o.level);
    if (!client.nextAppointment) levels.push('amber');
    if (client.coverageStatus === 'unaccepted') levels.push('red');
    if (client.consentStatus === 'review_due' || client.safetyPlanReviewDue) levels.push('amber');
    return highest(levels.length ? levels : ['green']);
  }

  function allowedForRole(action, role) {
    const policy = {
      viewClientOperational:['director','clinical_lead','psychologist','provisional'],
      manageSafety:['director','clinical_lead','psychologist'],
      manageReception:['director','clinical_lead','reception'],
      manageWorkforce:['director','clinical_lead'],
      manageSupervision:['director','clinical_lead'],
      participateSupervision:['director','clinical_lead','provisional'],
      manageCompliance:['director','clinical_lead'],
      manageGovernance:['director'],
      reviewReferral:['director','clinical_lead','psychologist'],
      exportAudit:['director','clinical_lead'],
      closeObligation:['director','clinical_lead','psychologist']
    };
    return (policy[action] || []).includes(role);
  }

  return {SEVERITY,WORKFLOW,rank,highest,nowIso,uid,dueState,missingEvidence,canClose,nextStage,calculatePracticeState,continuityState,allowedForRole};
});
