// Shows the harness at exactly 390 px wide (an iPhone), whatever the window size. ?h=1600 makes the
// frame taller, to see a whole screen at once.
const params = new URLSearchParams(location.search);
const frame = document.getElementById('phone');
frame.height = String(Number(params.get('h')) || 844);
frame.src = `./index.html${location.search}`;
