// Pre-React initialization. Must run before main.tsx so the first paint has
// the correct lang/dir and the PWA route is set. Loaded as an external file
// (not inline) so the production CSP `script-src 'self'` allows it.
(function () {
  try {
    var lang = localStorage.getItem('app_lang') || 'fr';
    var html = document.documentElement;
    if (lang === 'ar') {
      html.lang = 'ar';
      html.dir = 'rtl';
    } else {
      html.lang = 'fr';
      html.dir = 'ltr';
    }
  } catch (e) {}

  try {
    var h = window.location.hash;
    if (!h || h === '#' || h === '') {
      var standalone =
        window.matchMedia('(display-mode: standalone)').matches ||
        // @ts-ignore — non-standard iOS Safari property
        navigator.standalone;
      if (standalone || /Android|webOS|iPhone|iPad|iPod/i.test(navigator.userAgent)) {
        window.location.hash = '#login';
      }
    }
  } catch (e) {}
})();
