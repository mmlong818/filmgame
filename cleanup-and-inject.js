// 粘贴到浏览器控制台（F12 → Console）运行
(function(){
  var keys = [];
  for (var i = 0; i < localStorage.length; i++) {
    var k = localStorage.key(i);
    if (k && k.startsWith('filmgame:')) keys.push(k);
  }
  keys.forEach(function(k){ localStorage.removeItem(k); });
  console.log('[cleanup] 已清除', keys.length, '条旧数据');

  fetch('/api/projects/quantum-detective-seed')
    .then(function(res){ return res.json(); })
    .then(function(data){
      var project = data.project;
      if (!project) { console.error('[error] 项目不存在'); return; }
      var summary = {
        id: project.id,
        title: project.title,
        updatedAt: project.updatedAt,
        currentPhase: project.currentPhase,
        nodeCount: (project.nodes || []).length
      };
      localStorage.setItem('filmgame:project:' + project.id, JSON.stringify(project));
      localStorage.setItem('filmgame:projects:index', JSON.stringify([summary]));
      console.log('[inject] 量子侦探已注入，节点数：' + summary.nodeCount);
      window.location.href = '/project/' + project.id + '/workshop';
    })
    .catch(function(e){ console.error('[error]', e); });
})();
