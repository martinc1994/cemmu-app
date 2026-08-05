// Ejecución inmediata para evitar el parpadeo antes de que cargue el HTML
(function() {
    const savedTheme = localStorage.getItem('cemmu_theme');
    // Si el usuario eligió oscuro, o si nunca eligió pero su PC está en oscuro
    if (savedTheme === 'dark' || (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      document.documentElement.classList.add('dark-mode');
    }
  })();
  
  // Una vez el DOM cargó, damos vida al botón
  window.addEventListener('DOMContentLoaded', () => {
    const toggleBtn = document.getElementById('themeToggle');
    if (!toggleBtn) return;
    
    // Setear el icono correcto inicial
    const isDark = document.documentElement.classList.contains('dark-mode');
    toggleBtn.textContent = isDark ? '☀️' : '🌙';
  
    // Escuchar el clic
    toggleBtn.addEventListener('click', () => {
      document.documentElement.classList.toggle('dark-mode');
      const currentlyDark = document.documentElement.classList.contains('dark-mode');
      
      // Guardar preferencia
      localStorage.setItem('cemmu_theme', currentlyDark ? 'dark' : 'light');
      
      // Cambiar ícono con una mini animación opcional (solo cambio de texto por ahora)
      toggleBtn.textContent = currentlyDark ? '☀️' : '🌙';
    });
  });
