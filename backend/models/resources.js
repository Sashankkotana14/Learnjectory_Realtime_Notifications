// Table definitions: cols = editable columns, title = main text column (used for search/activity)
module.exports = {
  academics:{label:'Subject',title:'subject',cols:{subject:'TEXT',progress:'INTEGER DEFAULT 0',grade:'TEXT',target_grade:'TEXT',credits:'REAL DEFAULT 0',classes_attended:'INTEGER DEFAULT 0',classes_total:'INTEGER DEFAULT 0'}},
  assignments:{label:'Assignment',title:'title',cols:{title:'TEXT',subject:'TEXT',description:'TEXT',due_date:'TEXT',status:"TEXT DEFAULT 'pending'",completed_at:'TEXT'}},
  study_sessions:{label:'Study session',title:'title',cols:{title:'TEXT',session_date:'TEXT',duration:'INTEGER DEFAULT 30',completed:'INTEGER DEFAULT 0'}},
  goals:{label:'Goal',title:'title',cols:{title:'TEXT',progress:'INTEGER DEFAULT 0',target_date:'TEXT',description:'TEXT',completed_at:'TEXT'}},
  habits:{label:'Habit',title:'name',cols:{name:'TEXT',done_today:'INTEGER DEFAULT 0',streak:'INTEGER DEFAULT 0',category:"TEXT DEFAULT 'General'",daily_target:'INTEGER DEFAULT 1',target_type:"TEXT DEFAULT 'standard'",target_unit:"TEXT DEFAULT ''",target_label:"TEXT DEFAULT ''"}},
  projects:{label:'Project',title:'title',cols:{title:'TEXT',description:'TEXT',status:"TEXT DEFAULT 'active'",technologies:"TEXT DEFAULT ''",repo_url:"TEXT DEFAULT ''",completed_at:'TEXT'}},
  skills:{label:'Skill',title:'name',cols:{name:'TEXT',level:'INTEGER DEFAULT 0',category:"TEXT DEFAULT 'Other'"}},
  achievements:{label:'Achievement',title:'title',cols:{title:'TEXT',description:'TEXT',earned_at:'TEXT'}},
  opportunities:{label:'Opportunity',title:'title',cols:{title:'TEXT',org:'TEXT',type:'TEXT',link:'TEXT'}},
  community_posts:{label:'Post',title:'content',cols:{content:'TEXT'}},
  vault:{label:'Vault item',title:'title',cols:{title:'TEXT',content:'TEXT'}},
};
