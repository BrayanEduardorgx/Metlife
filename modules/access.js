(function () {
  const capabilities = {
    lector: ['read'],
    editor: ['read', 'write'],
    admin: ['read', 'write', 'delete'],
  };
  window.metlifeAccess = {
    allows(action) {
      return (capabilities[metlifeState.role] || []).includes(action);
    },
    async load(user) {
      const token = await user.getIdTokenResult?.();
      metlifeState.role = token ? token.claims.role : 'admin';
      return metlifeState.role;
    },
  };
  window.addEventListener('metlife:cloud-change', () => {
    const role = metlifeState.role;
    if (!role) return;
    const label = document.getElementById('accountRole');
    if (label) label.textContent = 'Permiso de tu cuenta: ' + role;
  });
})();
