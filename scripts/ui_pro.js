const UIController = {

    // Початкові дані
    harmonics: [{ l: 1, m: 0, coef: 1.0, phi0: 0, theta0: 0, active: true }],
    mode: 'color',
    time: 0,
    isAnimating: false,
    globalDeform: 0.3,
    timeMultiplier: 1.0,
    resolution: { Nu: 128, Nv: 64 },

    init() {
        const lightSlider = document.getElementById('light-intensity-slider');
        if (lightSlider) lightSlider.value = 0.50;
        if (typeof SceneEngine !== 'undefined' && SceneEngine.light) { SceneEngine.updateLightIntensity(0.50); }

        const deformSlider = document.getElementById('global-deform-slider');
        if (deformSlider) deformSlider.value = 0.30;

        const speedSlider = document.getElementById('speed-multiplier');
        if (speedSlider) speedSlider.value = 1;

        const timeSlider = document.getElementById('timeline-slider');
        if (timeSlider) timeSlider.value = 0;
        
        const onlyMesh = document.getElementById('mesh-opacity-slider');
        const meshCheck = document.getElementById('coordmesh');

        if (onlyMesh) onlyMesh.checked = false; // Вимикаємо "Тільки каркас" -> показуємо тіло
        if (meshCheck) meshCheck.checked = false; // Вимикаємо сітку за замовчуванням
        this.setupEventListeners();
        this.renderHarmControls(); 
        this.startAnimationLoop();
        const axisSelect = document.getElementById('axis-type-select');
        if (axisSelect) {
            axisSelect.dispatchEvent(new Event('change'));
        }
    },

    // 1. КЕРУВАННЯ КАМЕРОЮ (Ротація та Зум)
    setupCameraControls() {
        const canvas = document.getElementById('c');
        if (!canvas) return;

        let dragging = false;
        let lastX, lastY;

        canvas.addEventListener('mousedown', e => { 
            dragging = true; 
            lastX = e.clientX; 
            lastY = e.clientY; 
        });

        window.addEventListener('mouseup', () => dragging = false);

        window.addEventListener('mousemove', e => {
            if (!dragging || typeof SceneEngine === 'undefined') return;
            
            const dx = (e.clientX - lastX) * 0.008;
            const dy = (e.clientY - lastY) * 0.008;

            SceneEngine.euler.y += dx;
            SceneEngine.euler.x += dy;
            SceneEngine.euler.x = Math.max(-Math.PI/2, Math.min(Math.PI/2, SceneEngine.euler.x));
            
            SceneEngine.group.rotation.copy(SceneEngine.euler);
            lastX = e.clientX; 
            lastY = e.clientY;
        });

        canvas.addEventListener('wheel', e => {
            e.preventDefault();
            if (typeof SceneEngine === 'undefined') return;
            const zoomSpeed = 0.1;
            SceneEngine.camera.position.z += (e.deltaY > 0 ? zoomSpeed : -zoomSpeed);
            SceneEngine.camera.position.z = Math.max(1.5, Math.min(10, SceneEngine.camera.position.z));
        }, { passive: false });
    },

    // 2. ОБРОБКА ПОДІЙ ІНТЕРФЕЙСУ
    setupEventListeners() {
        this.setupCameraControls();

        const axisSelect = document.getElementById('axis-type-select');

        if (axisSelect) {
            axisSelect.addEventListener('change', (e) => {
                const type = e.target.value; // 'none', 'box' або 'surface'

                if (typeof SceneEngine !== 'undefined') {
                    // Спочатку все ховаємо
                    if (SceneEngine.axesHelper) SceneEngine.axesHelper.visible = false;
                    if (SceneEngine.boxHelper) SceneEngine.boxHelper.visible = false;

                    // Вмикаємо потрібне
                    if (type === 'surface' && SceneEngine.axesHelper) {
                        SceneEngine.axesHelper.visible = true;
                    } else if (type === 'box' && SceneEngine.boxHelper) {
                        SceneEngine.boxHelper.visible = true;
                    }

                    SceneEngine.render(); // Обов'язково оновлюємо кадр
                    
                }
            });
        }

        const lightSlider = document.getElementById('light-intensity-slider');
        if (lightSlider) {
            lightSlider.oninput = (e) => {
                const val = parseFloat(e.target.value);
                if (typeof SceneEngine !== 'undefined') {SceneEngine.updateLightIntensity(val);}
            };
        }

        // Обробка кнопок SD / HD
        const sdBtn = document.getElementById('res-sd-btn');
        const hdBtn = document.getElementById('res-hd-btn');

        if (sdBtn && hdBtn) {
            sdBtn.onclick = () => {
                this.resolution = { Nu: 128, Nv: 64 };
                this.updateResButtons(sdBtn, hdBtn);
                this.requestUpdate();
            };
            hdBtn.onclick = () => {
                this.resolution = { Nu: 256, Nv: 128 };
                this.updateResButtons(sdBtn, hdBtn);
                this.requestUpdate();
            };
        }

        // Чекбокс еталонної сфери
        const refSphereCheck = document.getElementById('reference-sphere-toggle');
        if (refSphereCheck) {
            refSphereCheck.onchange = (e) => {
                if (typeof SceneEngine !== 'undefined') {
                    SceneEngine.toggleHelper('sphere', e.target.checked);
                }   
            };
        }

        // Чекбокс екватора
        const equatorCheck = document.getElementById('equator-plane-toggle');
        if (equatorCheck) {
            equatorCheck.onchange = (e) => {
                if (typeof SceneEngine !== 'undefined') {SceneEngine.toggleHelper('equator', e.target.checked);}
            };
        }

        const coordmeshCheck = document.getElementById('coordmesh');
        if (coordmeshCheck) {
            coordmeshCheck.onchange = (e) => {
                if (typeof SceneEngine !== 'undefined') { SceneEngine.toggleHelper('coordmesh', e.target.checked); }
            };
        }

        // Кнопка скріншота
        const screenshotBtn = document.querySelector('.viewport-overlay-btn');
        if (screenshotBtn) {
            screenshotBtn.onclick = () => this.takeScreenshot();
        };

        // Кнопка додавання та видалення гармоніки
        const addBtn = document.getElementById('add-harmonic-btn');
        if (addBtn) addBtn.onclick = () => this.addHarmonic();

        const clearBtn = document.getElementById('clear-all-btn');
        if (clearBtn) clearBtn.onclick = () => this.clearAll();

        // Глобальні ліміти C
        const cMinInp = document.getElementById('c-min-input');
        const cMaxInp = document.getElementById('c-max-input');

        if (cMinInp) cMinInp.oninput = (e) => {
            document.querySelectorAll('.coeff-slider').forEach(s => s.min = e.target.value);
        };
        if (cMaxInp) cMaxInp.oninput = (e) => {
            document.querySelectorAll('.coeff-slider').forEach(s => s.max = e.target.value);
        };

        // Режими відображення
        document.querySelectorAll('.mode-btn').forEach(btn => {
            btn.onclick = () => {
                document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.mode = btn.dataset.mode;
                this.requestUpdate();
            };
        });

        // Повзунок загальної деформації
        const deformSlider = document.getElementById('global-deform-slider');
        const deformValSpan = document.getElementById('global-deform-val');

        if (deformSlider && deformValSpan) {
            deformSlider.oninput = (e) => {
                this.globalDeform = parseFloat(e.target.value);
                deformValSpan.textContent = this.globalDeform.toFixed(2);
                // Оновлюємо сцену негайно
                this.requestUpdate();
            };
        }

        // Анімація Старт/Пауза
        const playBtn = document.getElementById('play-pause-btn');
        if (playBtn) playBtn.onclick = () => {
            this.isAnimating = !this.isAnimating;
            playBtn.textContent = this.isAnimating ? '⏸' : '▶';
        };

        // Повзунки анімації та її швидкосі
        const timelineSlider = document.getElementById('timeline-slider');
        const speedSlider = document.getElementById('speed-multiplier');
        const speedVal = document.getElementById('speed-val');

        if (timelineSlider) {
            timelineSlider.oninput = (e) => {
                // Якщо ми рухаємо повзунок вручну, зупиняємо автоматичну анімацію (опційно)
                // або просто дозволяємо йому керувати часом
                this.time = parseFloat(e.target.value);
                this.requestUpdate();
            };
        }

        if (speedSlider) {
            speedSlider.oninput = (e) => {
                this.timeMultiplier = parseFloat(e.target.value);
                speedVal.textContent = this.timeMultiplier.toFixed(1) + 'x';
            };
        }

        const colorSelect = document.getElementById('color-scheme-select');
        if (colorSelect) {
            colorSelect.addEventListener('change', () => {
                this.requestUpdate(); // Повідомляємо двигуну, що треба перемалювати меш
            });
        }

        const meshCheck = document.getElementById('coordmesh');
        if (meshCheck) {
            meshCheck.addEventListener('change', () => {
                this.requestUpdate();
            });
        }

        const onlyMesh = document.getElementById('mesh-opacity-slider');
        if (onlyMesh) {
            onlyMesh.addEventListener('change', () => {
                this.requestUpdate();
            });
        }

        const helpBtn = document.getElementById('help-btn');
        if (helpBtn) {
            helpBtn.addEventListener('click', () => {
                // Назва вашого PDF файлу, що лежить поруч з index_pro.html
                window.open('math_harmonics_guide.pdf', '_blank');
            });
        }
    },

    // 3. ГЕНЕРАЦІЯ СПИСКУ ГАРМОНІК
    renderHarmControls() {
        const container = document.getElementById('harm-list');
        if (!container) return;
        
        // Очищуємо список, але лишаємо глобальні налаштування, якщо вони всередині
        const settings = container.querySelector('.global-settings-row');
        container.innerHTML = '';
        if (settings) container.appendChild(settings);

        this.harmonics.forEach((h, idx) => {
            const cMin = document.getElementById('c-min-input')?.value || -1;
            const cMax = document.getElementById('c-max-input')?.value || 1;

            const item = document.createElement('div');
            item.className = 'harmonic-item';
            item.innerHTML = `
                <div class="harm-main-row">
                    <input type="checkbox" ${h.active ? 'checked' : ''} onchange="UIController.harmonics[${idx}].active = this.checked; UIController.requestUpdate();">
                    <span class="harm-id">Y${idx + 1}</span>
                    <select class="pro-mini-select" onchange="UIController.updateL(${idx}, this.value)">
                        ${[0,1,2,3,4,5].map(l => `<option value="${l}" ${h.l === l ? 'selected' : ''}>l=${l}</option>`).join('')}
                    </select>
                    <select class="pro-mini-select" onchange="UIController.harmonics[${idx}].m = parseInt(this.value); UIController.requestUpdate();">
                        ${this.generateMOptions(h.l, h.m)}
                    </select>
                    <button class="remove-harm-btn" onclick="UIController.removeHarmonic(${idx})">×</button>
                </div>
                <div class="harm-parameters-block">
                    <div class="slider-full">
                        <span class="slider-label math-italic">C</span>
                        <input type="range" class="coeff-slider" min="${cMin}" max="${cMax}" step="0.01" value="${h.coef}" 
                               oninput="UIController.updateParam(${idx}, 'coef', this.value, this)">
                        <span class="val-display">${h.coef.toFixed(2)}</span>
                    </div>
                    <div class="slider-full">
                        <span class="slider-label math-italic">φ₀</span>
                        <input type="range" min="0" max="6.28" step="0.1" value="${h.phi0}" 
                               oninput="UIController.updateParam(${idx}, 'phi0', this.value, this)">
                        <span class="val-display">${h.phi0.toFixed(1)}</span>
                    </div>
                    <div class="slider-full">
                        <span class="slider-label math-italic">θ₀</span>
                        <input type="range" min="0" max="3.14" step="0.1" value="${h.theta0}" 
                               oninput="UIController.updateParam(${idx}, 'theta0', this.value, this)">
                        <span class="val-display">${h.theta0.toFixed(1)}</span>
                    </div>
                </div>
            `;
            container.appendChild(item);
        });
    },

    // 4. ДОПОМІЖНІ ФУНКЦІЇ УПРАВЛІННЯ
    addHarmonic() {
        this.harmonics.push({ l: 1, m: 0, coef: 1.0, phi0: 0, theta0: 0, active: true });
        this.renderHarmControls();
        this.requestUpdate();
    },

    removeHarmonic(idx) {
        this.harmonics.splice(idx, 1);
        this.renderHarmControls();
        this.requestUpdate();
    },

    updateL(idx, val) {
        const h = this.harmonics[idx];
        h.l = parseInt(val);
        if (Math.abs(h.m) > h.l) h.m = 0;
        this.renderHarmControls();
        this.requestUpdate();
    },

    updateParam(idx, param, val, el) {
        this.harmonics[idx][param] = parseFloat(val);
        el.nextElementSibling.textContent = param === 'coef' ? parseFloat(val).toFixed(2) : parseFloat(val).toFixed(1);
        this.requestUpdate();
    },

    generateMOptions(l, currentM) {
        let options = '';
        for (let m = -l; m <= l; m++) {
            options += `<option value="${m}" ${m === currentM ? 'selected' : ''}>m=${m}</option>`;
        }
        return options;
    },

    updateResButtons(sdBtn, hdBtn) {
        if (this.resolution.Nu === 128) {
            sdBtn.classList.add('active');
            hdBtn.classList.remove('active');
        } else {
            sdBtn.classList.remove('active');
            hdBtn.classList.add('active');
        }
    }, 

    requestUpdate() {
        if (typeof SceneEngine !== 'undefined') {
            SceneEngine.buildMesh(this.harmonics.filter(h => h.active), this.mode, this.time, this.globalDeform, this.resolution.Nu, this.resolution.Nv);
        }
    },

    startAnimationLoop() {
        let lastTimestamp = performance.now();
        const animate = (now) => {
            requestAnimationFrame(animate);
            const deltaTime = (now - lastTimestamp) / 1000; // Час у секундах
            lastTimestamp = now;
            if (this.isAnimating) {
                // Базова швидкість: 1 радіан за 1.5 секунди = (1 / 1.5)
                // Множимо на ваш повзунок швидкості
                const baseSpeed = 1 / 1.5; 
                this.time += deltaTime * baseSpeed * this.timeMultiplier;
            
                // Строге зациклення на 2*PI
                if (this.time >= Math.PI * 2) {this.time = 0;}
            
                // Оновлення інтерфейсу
                const timelineSlider = document.getElementById('timeline-slider');
                const timeDisplay = document.getElementById('time-display');
            
                if (timelineSlider) timelineSlider.value = this.time;
                if (timeDisplay) timeDisplay.textContent = this.time.toFixed(2);
            
                this.requestUpdate();
            }
            if (typeof SceneEngine !== 'undefined') {SceneEngine.render();}
        };
        animate(performance.now());
    },

    takeScreenshot() {
        if (typeof SceneEngine === 'undefined' || !SceneEngine.renderer) return;

        // 1. Обов'язково робимо фінальний рендер перед знімком
        SceneEngine.render();

        // 2. Отримуємо дані з канвасу у форматі PNG
        const dataURL = SceneEngine.renderer.domElement.toDataURL("image/png");

        // 3. Створюємо тимчасовий елемент посилання для завантаження
        const link = document.createElement('a');
    
        // Формуємо ім'я файлу з поточною міткою часу
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        link.download = `sh-pro-export-${timestamp}.png`;
        link.href = dataURL;
        link.click(); // Імітуємо клік для завантаження
    },

  
    // Додати як новий метод об'єкта UIController
    clearAll() {
        if (confirm("Видалити всі гармоніки?")) {
            this.harmonics = []; // Очищаємо масив
            this.harmonicCount = 0; // Скидаємо лічильник
            this.renderHarmControls(); // Оновлюємо панель
            this.requestUpdate(); // Оновлюємо 3D сцену
            const playBtn = document.getElementById('play-pause-btn');
            if (playBtn) playBtn.onclick = () => {
                this.isAnimating = !this.isAnimating;
                playBtn.textContent = this.isAnimating ? '⏸' : '▶';
            };
            this.isAnimating = false;
            this.time = 0;
            document.getElementById('time-display').textContent = "0.00";
            document.getElementById('timeline-slider').value = 0;
        }
    }
};

window.onload = () => UIController.init();