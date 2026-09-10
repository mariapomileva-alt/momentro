/**
 * Momentro gift certificate PDF (landscape).
 * Renders a branded HTML card to canvas, then saves via jsPDF.
 */
(function (global) {
  var NAVY = "#10233d";
  var GREEN = "#89ff2e";
  var CREAM = "#f4f9ef";
  var MUTED = "#5a677f";
  var INK = "#0f223e";

  var libsPromise = null;

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var existing = document.querySelector('script[src="' + src + '"]');
      if (existing) {
        if (existing.dataset.loaded === "1") return resolve();
        existing.addEventListener("load", function () { resolve(); });
        existing.addEventListener("error", reject);
        return;
      }
      var s = document.createElement("script");
      s.src = src;
      s.async = true;
      s.onload = function () {
        s.dataset.loaded = "1";
        resolve();
      };
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  function ensureLibs() {
    if (libsPromise) return libsPromise;
    libsPromise = Promise.all([
      loadScript("https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js"),
      loadScript("https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js"),
    ]);
    return libsPromise;
  }

  function kindCopy(kind) {
    if (kind === "gift_annual") {
      return {
        title: "One year unlimited",
        blurb: "Twelve months of watermark-free exports — a prepaid gift year.",
        filename: "Momentro-Gift-1-Year.pdf",
      };
    }
    return {
      title: "One film unlock",
      blurb: "One watermark-free project unlock for any Momentro film.",
      filename: "Momentro-Gift-One-Film.pdf",
    };
  }

  function buildCertificateNode(code, kind) {
    var copy = kindCopy(kind);
    var root = document.createElement("div");
    root.setAttribute("aria-hidden", "true");
    root.style.cssText = [
      "position:fixed",
      "left:-10000px",
      "top:0",
      "width:1200px",
      "height:850px",
      "box-sizing:border-box",
      "padding:36px",
      "background:" + CREAM,
      "font-family:Outfit,system-ui,sans-serif",
      "color:" + INK,
      "letter-spacing:-0.02em",
    ].join(";");

    root.innerHTML =
      '<div style="height:100%;box-sizing:border-box;border:2px solid #dbe8cf;border-radius:28px;background:linear-gradient(145deg,#ffffff 0%,#f4f9ef 55%,#eef8e4 100%);padding:42px 48px;display:flex;flex-direction:column;position:relative;overflow:hidden;">' +
        '<div style="position:absolute;inset:18px;border:1px solid rgba(16,35,61,0.08);border-radius:22px;pointer-events:none;"></div>' +
        '<div style="position:absolute;right:-80px;top:-80px;width:280px;height:280px;border-radius:50%;background:rgba(137,255,46,0.18);"></div>' +
        '<div style="position:absolute;left:-60px;bottom:-90px;width:260px;height:260px;border-radius:50%;background:rgba(16,35,61,0.06);"></div>' +

        '<div style="display:flex;align-items:center;justify-content:space-between;position:relative;z-index:1;">' +
          '<div style="display:flex;align-items:center;gap:14px;">' +
            '<div style="width:56px;height:56px;border-radius:16px;background:' + NAVY + ';color:' + GREEN + ';display:flex;align-items:center;justify-content:center;">' +
              '<svg width="34" height="34" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">' +
                '<path d="M9 31V9L20 23L31 9V31" stroke="currentColor" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round"/>' +
              "</svg>" +
            "</div>" +
            '<div style="font-size:34px;font-weight:900;color:' + NAVY + ';">Momentro</div>' +
          "</div>" +
          '<div style="font-size:13px;font-weight:800;letter-spacing:0.18em;text-transform:uppercase;color:' + MUTED + ';">Gift certificate</div>' +
        "</div>" +

        '<div style="flex:1;display:flex;flex-direction:column;justify-content:center;gap:18px;position:relative;z-index:1;padding:18px 0 8px;">' +
          '<div style="font-size:18px;font-weight:800;color:' + MUTED + ';">A gift for you</div>' +
          '<div style="font-size:48px;line-height:0.95;font-weight:900;color:' + NAVY + ';max-width:18ch;">' + copy.title + "</div>" +
          '<div style="font-size:18px;font-weight:650;color:' + MUTED + ';max-width:42ch;line-height:1.35;">' + copy.blurb + "</div>" +

          '<div style="margin-top:10px;background:' + NAVY + ';border-radius:20px;padding:22px 28px;display:flex;flex-direction:column;gap:8px;align-items:center;">' +
            '<div style="font-size:12px;font-weight:800;letter-spacing:0.16em;text-transform:uppercase;color:rgba(246,255,241,0.7);">Redeem code</div>' +
            '<div style="font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:40px;letter-spacing:0.12em;color:' + GREEN + ';font-weight:800;">' +
              String(code || "").replace(/</g, "") +
            "</div>" +
          "</div>" +
        "</div>" +

        '<div style="display:grid;grid-template-columns:1.4fr 1fr;gap:24px;position:relative;z-index:1;padding-top:8px;border-top:1px solid #dbe8cf;">' +
          '<div style="font-size:14px;font-weight:700;color:' + MUTED + ';line-height:1.45;">' +
            "<strong style=\"color:" + NAVY + ';">How to redeem</strong><br/>' +
            "1. Download Momentro for Mac or Windows<br/>" +
            "2. Open Account and paste this code<br/>" +
            "3. Redeem — then enjoy the gift" +
          "</div>" +
          '<div style="text-align:right;font-size:14px;font-weight:800;color:' + NAVY + ';line-height:1.45;">' +
            "momentro.me<br/>" +
            '<span style="color:' + MUTED + ';font-weight:700;">download.momentro.me</span>' +
          "</div>" +
        "</div>" +
      "</div>";

    document.body.appendChild(root);
    return { node: root, filename: copy.filename };
  }

  async function downloadGiftCertificatePdf(code, kind) {
    if (!code || String(code).indexOf("—") === 0) {
      throw new Error("Gift code is not ready yet.");
    }
    await ensureLibs();
    var html2canvas = global.html2canvas;
    var jsPDF = (global.jspdf && global.jspdf.jsPDF) || global.jsPDF;
    if (!html2canvas || !jsPDF) {
      throw new Error("PDF libraries failed to load.");
    }

    var built = buildCertificateNode(code, kind);
    try {
      // Wait a frame so Outfit is applied to the offscreen node.
      await new Promise(function (r) { requestAnimationFrame(function () { requestAnimationFrame(r); }); });
      var canvas = await html2canvas(built.node, {
        backgroundColor: CREAM,
        scale: 2,
        useCORS: true,
        logging: false,
      });
      var img = canvas.toDataURL("image/jpeg", 0.95);
      var pdf = new jsPDF({
        orientation: "landscape",
        unit: "mm",
        format: "a4",
      });
      var pageW = pdf.internal.pageSize.getWidth();
      var pageH = pdf.internal.pageSize.getHeight();
      pdf.addImage(img, "JPEG", 0, 0, pageW, pageH);
      pdf.save(built.filename);
    } finally {
      if (built.node && built.node.parentNode) {
        built.node.parentNode.removeChild(built.node);
      }
    }
  }

  global.MomentroGiftCertificate = {
    download: downloadGiftCertificatePdf,
    kindCopy: kindCopy,
  };
})(window);
