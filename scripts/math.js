// math.js - Чиста математика вашої моделі
const MathCore = {
    // Факторіал для нормування
    factorial(n) {
        if (n <= 1) return 1;
        let r = 1; for (let i = 2; i <= n; i++) r *= i; return r;
    },

    // Асоційовані поліноми Лежандра (основа гармонік)
    assocLegendre(l, m, x) {
        const absm = Math.abs(m);
        let pmm = 1;
        if (absm > 0) {
            const somx2 = Math.sqrt((1 - x) * (1 + x));
            let fact = 1;
            for (let i = 1; i <= absm; i++) { pmm *= (-fact) * somx2; fact += 2; }
        }
        if (l === absm) return pmm;
        let pmmp1 = x * (2 * absm + 1) * pmm;
        if (l === absm + 1) return pmmp1;
        let pll = 0;
        for (let ll = absm + 2; ll <= l; ll++) {
            pll = ((2 * ll - 1) * x * pmmp1 - (ll + absm - 1) * pmm) / (ll - absm);
            pmm = pmmp1; pmmp1 = pll;
        }
        return pll;
    },

    // Дійсна сферична гармоніка Y(l, m)
    realSH(l, m, theta, phi) {
        const absm = Math.abs(m);
        const norm = Math.sqrt((2 * l + 1) / (4 * Math.PI) * this.factorial(l - absm) / this.factorial(l + absm));
        const P = this.assocLegendre(l, absm, Math.cos(theta));
        if (m === 0) return norm * P;
        if (m > 0) return Math.SQRT2 * norm * P * Math.cos(m * phi);
        return Math.SQRT2 * norm * P * Math.sin(-m * phi);
    },

    // Обчислення сумарного потенціалу з урахуванням часу (для хвиль або сезонів)
    evalCombined(harmonics, theta, phi, time = 0) {
        let val = 0;
        for (const h of harmonics) {
            if (Math.abs(h.coef) < 1e-6) continue;

            // 1. Враховуємо індивідуальні зміщення координат
            const shiftedTheta = theta - (h.theta0 || 0);
            const shiftedPhi = phi - (h.phi0 || 0);

            // 2. Розраховуємо фізичну частоту з вашого конспекту [cite: 12, 18]
            const omega = Math.sqrt(h.l * (h.l + 1));

            // 3. Часова фаза (стояча хвиля) [cite: 20, 27]
            const timePhase = Math.cos(omega * time);

            // 4. Додаємо в суму з урахуванням зміщених кутів
            val += h.coef * timePhase * this.realSH(h.l, h.m, shiftedTheta, shiftedPhi);
        }
        return val;
    }
};