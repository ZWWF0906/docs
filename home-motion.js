/* 首页渐进增强：仅处理 .zl-home，不参与 MDX 内容解析。 */
(() => {
  if (typeof window.matchMedia !== "function") return;

  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  const fine = window.matchMedia("(hover: hover) and (pointer: fine)");
  const mounted = new Map();

  function mount(root) {
    const cleanups = [];
    const cleanup = () => {
      cleanups.splice(0).reverse().forEach((fn) => fn());
    };

    try {
      // 只有初始化时仍在首屏下方的内容参与入场，不隐藏已有焦点。
      if (!reduce.matches && "IntersectionObserver" in window) {
        const fold = window.innerHeight || document.documentElement.clientHeight;
        const pending = Array.from(root.querySelectorAll(".zl-reveal")).filter(
          (el) => el.getBoundingClientRect().top > fold && !el.matches(":focus-within")
        );
        const timers = new Set();
        let io;
        const showAll = () => {
          if (io) io.disconnect();
          timers.forEach((timer) => window.clearTimeout(timer));
          timers.clear();
          pending.forEach((el) => {
            el.classList.remove("zl-pending");
            el.style.transitionDelay = "";
          });
        };
        cleanups.push(showAll);

        if (pending.length) {
          io = new IntersectionObserver((entries) => {
            try {
              let step = 0;
              entries.forEach((entry) => {
                if (!entry.isIntersecting) return;
                const el = entry.target;
                io.unobserve(el);
                el.style.transitionDelay = Math.min(step, 4) * 70 + "ms";
                step += 1;
                el.classList.remove("zl-pending");
                const timer = window.setTimeout(() => {
                  el.style.transitionDelay = "";
                  timers.delete(timer);
                }, 1100);
                timers.add(timer);
              });
            } catch (error) {
              showAll();
            }
          }, { rootMargin: "0px 0px -48px 0px", threshold: 0 });

          pending.forEach((el) => {
            io.observe(el);
            el.classList.add("zl-pending");
          });

          const onFocus = (event) => {
            const el = event.target.closest(".zl-pending");
            if (!el || !root.contains(el)) return;
            io.unobserve(el);
            el.style.transitionDelay = "";
            el.classList.remove("zl-pending");
          };
          const onReduce = () => {
            if (reduce.matches) showAll();
          };
          root.addEventListener("focusin", onFocus);
          cleanups.push(() => root.removeEventListener("focusin", onFocus));
          if (typeof reduce.addEventListener === "function") {
            reduce.addEventListener("change", onReduce);
            cleanups.push(() => reduce.removeEventListener("change", onReduce));
          }
        }
      }

      // 事件驱动的光晕，仅在精细指针且未启用减少动态效果时移动。
      if (typeof window.requestAnimationFrame === "function") {
        const hosts = Array.from(root.querySelectorAll(".zl-glow-host"))
          .map((el) => ({
            el,
            layer: el.querySelector(".zl-glow"),
            blob: el.querySelector(".zl-glow-blob"),
            active: false,
            x: 0,
            y: 0,
            restX: 0,
            restY: 0,
          }))
          .filter((host) => host.layer && host.blob);
        let frame = 0;
        const reset = (host) => {
          host.active = false;
          host.el.classList.remove("zl-glow-active");
          host.el.style.removeProperty("--zl-dx");
          host.el.style.removeProperty("--zl-dy");
          host.blob.style.transition = "";
        };
        const resetAll = () => {
          if (frame) window.cancelAnimationFrame(frame);
          frame = 0;
          hosts.forEach(reset);
        };
        cleanups.push(resetAll);
        const place = (host) => {
          const rect = host.layer.getBoundingClientRect();
          host.el.style.setProperty("--zl-dx", (host.x - rect.left - host.restX).toFixed(1) + "px");
          host.el.style.setProperty("--zl-dy", (host.y - rect.top - host.restY).toFixed(1) + "px");
        };
        const schedule = () => {
          if (frame || !hosts.some((host) => host.active)) return;
          frame = window.requestAnimationFrame(() => {
            frame = 0;
            if (reduce.matches || !fine.matches || !root.isConnected) {
              resetAll();
              return;
            }
            hosts.forEach((host) => {
              if (host.active) place(host);
            });
          });
        };

        hosts.forEach((host) => {
          const onMove = (event) => {
            if (event.pointerType === "touch" || reduce.matches || !fine.matches) {
              reset(host);
              return;
            }
            host.x = event.clientX;
            host.y = event.clientY;
            if (!host.active) {
              host.restX = host.blob.offsetLeft;
              host.restY = host.blob.offsetTop;
              host.active = true;
              if (host.layer.classList.contains("zl-glow-soft")) {
                host.blob.style.transition = "none";
                place(host);
                host.blob.getBoundingClientRect();
                host.blob.style.transition = "";
              }
              host.el.classList.add("zl-glow-active");
            }
            schedule();
          };
          const onLeave = () => reset(host);
          host.el.addEventListener("pointermove", onMove, { passive: true });
          host.el.addEventListener("pointerleave", onLeave);
          cleanups.push(() => {
            host.el.removeEventListener("pointermove", onMove);
            host.el.removeEventListener("pointerleave", onLeave);
          });
        });

        window.addEventListener("scroll", schedule, { passive: true, capture: true });
        cleanups.push(() => window.removeEventListener("scroll", schedule, true));
        [reduce, fine].forEach((query) => {
          if (typeof query.addEventListener !== "function") return;
          query.addEventListener("change", resetAll);
          cleanups.push(() => query.removeEventListener("change", resetAll));
        });
      }
    } catch (error) {
      // 初始化失败时恢复所有内容，不让动效阻断阅读。
      cleanup();
    }
    return cleanup;
  }

  function sync() {
    const roots = new Set(document.querySelectorAll(".zl-home"));
    mounted.forEach((cleanup, root) => {
      if (roots.has(root)) return;
      cleanup();
      mounted.delete(root);
    });
    roots.forEach((root) => {
      if (!mounted.has(root)) mounted.set(root, mount(root));
    });
  }

  // Mintlify 的页面导航事件在新页面渲染后触发；重复通知不会重复绑定。
  window.addEventListener("mintlify:navigate", sync);
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", sync, { once: true });
  } else {
    sync();
  }
})();
