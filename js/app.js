function bindNav() {
  document.querySelectorAll('.tab-btn, .tab-center-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var target = this.getAttribute('data-target');
      var screenId = 'screen-' + target;

      // Update active tab styling
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      if (this.classList.contains('tab-btn')) this.classList.add('active');

      navigateTo(screenId);
    });
  });
}
