(() => {
  const LINKS = [
    { id: "style", href: "./style-guide.html", label: "Style guide" },
    { id: "logo", href: "./logo-explorations.html", label: "Logo" },
    { id: "mobile", href: "./app-mockups.html", label: "Mobile" },
    { id: "ask", href: "./ask-claire-mockups.html", label: "Ask Claire" },
    { id: "desktop", href: "./desktop-mockups.html", label: "Desktop" },
    { id: "plugins", href: "./plugin-mockups.html", label: "Plugins" },
  ];

  function render(current) {
    const header = document.querySelector("[data-lab-nav]");
    if (!header) return;

    const active = current || header.getAttribute("data-lab-nav") || "";
    header.className = "lab-header";
    header.innerHTML = `
      <a class="lab-brand" href="./style-guide.html">
        <img class="lab-brand-mark" src="./assets/brand/claire-app-icon-lime.svg" alt="" />
        claire <span>/ lab</span>
      </a>
      <nav class="lab-links" aria-label="Claire Lab">
        ${LINKS.map(
          (link) =>
            `<a data-lab-link="${link.id}" href="${link.href}"${link.id === active ? ' class="active" aria-current="page"' : ""}>${link.label}</a>`
        ).join("")}
      </nav>
    `;
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => render());
  } else {
    render();
  }
})();
