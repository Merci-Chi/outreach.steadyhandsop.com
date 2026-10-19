(() => {
  const portal=new URL('https://onboard.steadyhandsop.com/');
  portal.searchParams.set('from','outreach');
  portal.searchParams.set('return_to','https://outreach.steadyhandsop.com/index.html');
  location.replace(portal.href);
})();
