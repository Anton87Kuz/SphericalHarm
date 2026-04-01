// engine.js - Рендеринг та 3D сцена
const SceneEngine = {
    scene: null,
    camera: null,
    renderer: null,
    meshObj: null,
    group: null,
    euler: new THREE.Euler(0.3, 0.5, 0, 'YXZ'),
    light: null, // Додаємо посилання на світло для керування яскравістю
    refSphere: null,
    equatorPlane: null,

    init(canvasId, containerId) {
        const canvas = document.getElementById(canvasId);
        const container = document.getElementById(containerId);
        this.renderer = new THREE.WebGLRenderer({ 
            canvas, 
            antialias: true, 
            alpha: true,
            preserveDrawingBuffer: true // Необхідно для коректних скріншотів
        });
        
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
   
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 100);
        this.camera.position.set(0, 0, 3.5);

        this.setupLighting();
        
        this.group = new THREE.Group();
        this.scene.add(this.group);
        this.group.rotation.copy(this.euler);
        this.setupHelperGeometry();
        this.setupGizmos();
        // Початкова побудова мешу (з даними за замовчуванням з UIController)
        if (typeof UIController !== 'undefined') {
            this.buildMesh(UIController.harmonics, UIController.mode, UIController.time, UIController.globalDeform);
        }

        window.addEventListener('resize', () => this.onWindowResize(container));
        this.onWindowResize(container);
    },

    setupLighting() {
        // Основне розсіяне світло
        this.ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(this.ambientLight);

        // Спрямоване світло для рельєфу (збережемо посилання для UI)
        this.light = new THREE.DirectionalLight(0xffffff, 0.5);
        this.light.position.set(25, 25, 25);
        this.scene.add(this.light);

        // Додаткове м'яке підсвічування знизу
        const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.2);
        this.scene.add(hemiLight);

       // const rimLight = new THREE.PointLight(0xffffff, 0.4);
        //rimLight.position.set(5, 2, 5);
        //this.scene.add(rimLight);
    },

    updateLightIntensity(value) {
        if (this.light && this.ambientLight) {
            // Обмежуємо пряме світло, щоб воно не "спалювало" колір
            this.light.intensity = value*0.6; 
        
            // Робимо тіні дуже глибокими, щоб підкреслити рельєф без пересвіту
            // При value=2.0 (макс), Ambient буде майже 0.0, що дасть ідеальний об'єм
            this.ambientLight.intensity = Math.max(0.1, 0.6 - (value * 0.2));
        }
    },

    setupHelperGeometry() {
        // 1. Еталонна сфера (R=1)
        const sphereGeo = new THREE.SphereGeometry(1, 64, 32);
        const sphereMat = new THREE.MeshPhongMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.15, // "Туманний" ефект
            wireframe: true // Можна зробити сіткою для кращої орієнтації
        });
        this.refSphere = new THREE.Mesh(sphereGeo, sphereMat);
        this.refSphere.visible = false; // За замовчуванням прихована
        this.group.add(this.refSphere);

        // 2. Площина екватора (XY при z=0)
        const planeGeo = new THREE.CircleGeometry(1.5, 64);
        const planeMat = new THREE.MeshPhongMaterial({
            color: 0x4466ff,
            transparent: true,
            opacity: 0.25,
            side: THREE.DoubleSide
        });
        this.equatorPlane = new THREE.Mesh(planeGeo, planeMat);
        // Повертаємо, щоб вона була горизонтальною (екватор)
        this.equatorPlane.rotation.x = Math.PI / 2;
        this.equatorPlane.visible = false; 
        this.group.add(this.equatorPlane);
    },

    toggleHelper(type, isVisible) {
        if (type === 'sphere' && this.refSphere) this.refSphere.visible = isVisible;
        if (type === 'equator' && this.equatorPlane) this.equatorPlane.visible = isVisible;
        //if (type === 'coordmesh' && this.coordMesh) this.coordMesh.visible = isVisible;
        this.render(); // Оновлюємо кадр
    },

    buildMesh(harmonics, mode, time, deformMult = 0.8, Nu = 128, Nv = 64) {
        //if (this.meshObj) {
        //    this.group.remove(this.meshObj);
        //    if (this.meshObj.geometry) this.meshObj.geometry.dispose();
        //    if (this.meshObj.material) this.meshObj.material.dispose();
        //}
        // 1. Очищення групи від попередніх об'єктів


        //if (this.group) {
        //    // Видаляємо всі об'єкти крім допоміжної геометрії (refSphere, equatorPlane)
        //    // Або просто видаляємо конкретно meshObj та старі лінії
        //    const objectsToRemove = [];
        //    this.group.traverse((child) => {
        //        if (child.isMesh && child !== this.refSphere && child !== this.equatorPlane) objectsToRemove.push(child);
        //        if (child.isLineSegments) objectsToRemove.push(child);
        //    });
        //    objectsToRemove.forEach(obj => {
        //        if (obj.geometry) obj.geometry.dispose();
        //        if (obj.material) obj.material.dispose();
        //        this.group.remove(obj);
        //    });
        //}
        const toRemove = [];

        this.group.children.forEach(child => {
            // Видаляємо тільки якщо це НЕ наш постійний помічник
            if (child.name !== "permanent_helper" && child !== this.refSphere && child !== this.equatorPlane) {
                toRemove.push(child);
            }
        });

        toRemove.forEach(obj => {
            if (obj.geometry) obj.geometry.dispose();
            if (obj.material) obj.material.dispose();
            this.group.remove(obj);
        });
      
        const pos = [], col = [], norm = [];
        const vals = [];

        // 1. Обчислення значень через MathCore
        for (let j = 0; j <= Nv; j++) {
            const theta = (j / Nv) * Math.PI;
            for (let i = 0; i <= Nu; i++) {
                const phi = (i / Nu) * 2 * Math.PI;
                // Враховуємо фазові зміщення phi0 та theta0 для кожної гармоніки
                vals.push(MathCore.evalCombined(harmonics, theta, phi, time));
            }
        }
        const epsilon = 0.05;
        const vrange = Math.max(...vals.map(Math.abs))+epsilon || 1;
        //const vrange = harmonics.reduce((sum, h) => sum + Math.abs(h.coef), 0) || 1;
        const colorMode = document.getElementById('color-scheme-select')?.value || 'classic';
        const isWire = document.getElementById('coordmesh')?.checked;
        const hideSurface = document.getElementById('mesh-opacity-slider')?.checked;
       
        // 2. Генерація геометрії
        for (let j = 0; j <= Nv; j++) {
            const theta = (j / Nv) * Math.PI;
            const st = Math.sin(theta), ct = Math.cos(theta);

            for (let i = 0; i <= Nu; i++) {
                const phi = (i / Nu) * 2 * Math.PI;
                const sp = Math.sin(phi), cp = Math.cos(phi);
                
                const v = vals[j * (Nu + 1) + i];
                const t = v / vrange;

                let r = 1;
                if (mode === 'amplitude') {
                    r = (Math.abs(v) / vrange) * 1.5 + 0.05;
                } else if (mode === 'deform') {
                    r = Math.max(0.1, 1 + t * deformMult);
                }

                const x =  (r * st * cp), y = r * ct, z = -(r * st * sp);
                pos.push(x, y, z);
                
                // Сферичні нормалі для гладкості
                const len = Math.sqrt(x*x + y*y + z*z) || 1;
                norm.push(x / len, y / len, z / len);
                let cr = 1, cg = 1, cb = 1;

                if (colorMode === 'grayscale') {
                    // Переводимо [-1, 1] в [0, 1] для градієнту сірого
                    let tGray = (t + 1) / 2;
                    cr = cg = cb = tGray;
                    
                } else if (colorMode === 'classic') {
                    // ВАША ФОРМУЛА
                    if (t > 0) {
                        cg = 1 - t * 0.55;
                        cb = 1 - t;
                    } else {
                        cg = 1 + t * 0.8;
                        cr = 1 + t;
                    }
                }
                col.push(cr, cg, cb);
            }
        }

        // 3. Створення ПОВЕРХНІ (Mesh) - вона малюється завжди, якщо opacity > 0
        if (!hideSurface) {
            const meshIdx = [];
            for (let j = 0; j < Nv; j++) {
                for (let i = 0; i < Nu; i++) {
                    const a = j * (Nu + 1) + i, b = a + 1;
                    const c = a + (Nu + 1), d = c + 1;
                    meshIdx.push(a, c, b, b, c, d);
                }
            }
            const meshGeo = new THREE.BufferGeometry();
            meshGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
            meshGeo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
            meshGeo.setAttribute('normal', new THREE.Float32BufferAttribute(norm, 3));
            meshGeo.setIndex(meshIdx);
            const meshMat = new THREE.MeshPhongMaterial({
                vertexColors: true,
                side: THREE.DoubleSide,
                shininess: 60,
            });
            this.meshObj = new THREE.Mesh(meshGeo, meshMat);
            this.group.add(this.meshObj);
        } 
        // 4. Створення СІТКИ (LineSegments) поверх поверхні
        if (isWire) {
            const gridIdx = [];
            const skip = 4; // Проріджування
            for (let j = 0; j <= Nv; j += skip) {
                for (let i = 0; i < Nu; i++) {
                    const a = j * (Nu + 1) + i;
                    gridIdx.push(a, a + 1);
                }
            }
            for (let i = 0; i <= Nu; i += skip) {
                for (let j = 0; j < Nv; j++) {
                    const a = j * (Nu + 1) + i;
                    gridIdx.push(a, a + (Nu + 1));
                }
            }

            const gridGeo = new THREE.BufferGeometry();
            gridGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
            gridGeo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
            gridGeo.setIndex(gridIdx);

            const gridMat = new THREE.LineBasicMaterial({
                vertexColors: true,
                transparent: true,
                opacity: 0.6
            });
            const gridLines = new THREE.LineSegments(gridGeo, gridMat);
            this.group.add(gridLines);
        }
        //// 3. Створення індексів (точкове оновлення)
        //if (isWire) {
        //    const skip = 4; // Крок проріджування: кожна 4-та лінія
        //    for (let j = 0; j <= Nv; j++) {
        //        for (let i = 0; i <= Nu; i++) {
        //            const idx1 = j * (Nu + 1) + i;
        //            // Горизонтальні лінії (паралелі) - малюємо кожну skip-ту
        //            if (j % skip === 0 && i < Nu) {
        //                idx.push(idx1, idx1 + 1);
        //            }
        //            // Вертикальні лінії (меридіани) - малюємо кожну skip-ту
        //            if (i % skip === 0 && j < Nv) {
        //                idx.push(idx1, idx1 + (Nu + 1));
        //            }
        //        }
        //    }
        //} else {
        //    // 3. Створення індексів
        //    for (let j = 0; j < Nv; j++) {
        //        for (let i = 0; i < Nu; i++) {
        //            const a = j * (Nu + 1) + i, b = a + 1;
        //            const c = a + (Nu + 1), d = c + 1;
        //            idx.push(a, c, b, b, c, d);
        //        }
        //    }
        //}

        //const geo = new THREE.BufferGeometry();
        //geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        //geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
        //geo.setAttribute('normal', new THREE.Float32BufferAttribute(norm, 3));
        //geo.setIndex(idx);

        //if (isWire) {
        //    const mat = new THREE.LineBasicMaterial({
        //        vertexColors: true,
        //        transparent: true,
        //        opacity: 0.6
        //    });
        //    this.meshObj = new THREE.LineSegments(geo, mat);
        //} else {
        //    const mat = new THREE.MeshPhongMaterial({
        //        vertexColors: true,
        //        side: THREE.DoubleSide,
        //        shininess: 60,
        //        flatShading: false
        //    });
        //    this.meshObj = new THREE.Mesh(geo, mat);
        //}

       // this.meshObj = new THREE.Mesh(geo, mat);
       // this.group.add(this.meshObj);
    },

    setupGizmos() {
        const axisLen = 2.0;
        const colors = {
            x: new THREE.Color(0xff3e3e), // Червоний
            y: new THREE.Color(0x28fd3d), // Зелений
            z: new THREE.Color(0x3c3cff)  // Синій
        };

        this.axesHelper = new THREE.Group();
        this.axesHelper.name = "permanent_helper";

        const addAxis = (dir, color, isNegative = false) => {
            const points = [new THREE.Vector3(0, 0, 0), dir.clone().multiplyScalar(axisLen)];
            const geo = new THREE.BufferGeometry().setFromPoints(points);
            let mat = isNegative ?
                new THREE.LineDashedMaterial({ color, dashSize: 0.1, gapSize: 0.05, transparent: true, opacity: 0.4 }) :
                new THREE.LineBasicMaterial({ color });

            const line = new THREE.Line(geo, mat);
            if (isNegative) line.computeLineDistances();
            this.axesHelper.add(line);
        };

        // 1. Математична Z (Синя) — ВГОРУ
        addAxis(new THREE.Vector3(0, 1, 0), colors.z);
        addAxis(new THREE.Vector3(0, -1, 0), colors.z, true);

        // 2. Математична X (Червона) — ВПРАВО
        addAxis(new THREE.Vector3(-1, 0, 0), colors.x);
        addAxis(new THREE.Vector3(1, 0, 0), colors.x, true);

        // 3. Математична Y (Зелена) — ВГЛИБ
        addAxis(new THREE.Vector3(0, 0, 1), colors.y);
        addAxis(new THREE.Vector3(0, 0, -1), colors.y, true);

        this.group.add(this.axesHelper);

        // БОКС з кольоровими ребрами
        const boxVertices = [];
        const boxColors = [];
        const size = 1.0;
        const addEdge = (p1, p2, col) => {
            boxVertices.push(...p1, ...p2);
            boxColors.push(col.r, col.g, col.b, col.r, col.g, col.b);
        };

        for (let i = -1; i <= 1; i += 2) {
            for (let j = -1; j <= 1; j += 2) {
                addEdge([-size, i * size, j * size], [size, i * size, j * size], colors.x); // X ребра
                addEdge([i * size, -size, j * size], [i * size, size, j * size], colors.z); // Z ребра (сині вертикалі)
                addEdge([i * size, j * size, -size], [i * size, j * size, size], colors.y); // Y ребра
            }
        }

        const boxGeo = new THREE.BufferGeometry();
        boxGeo.setAttribute('position', new THREE.Float32BufferAttribute(boxVertices, 3));
        boxGeo.setAttribute('color', new THREE.Float32BufferAttribute(boxColors, 3));
        this.boxHelper = new THREE.LineSegments(boxGeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.3 }));
        this.boxHelper.name = "permanent_helper";
        this.group.add(this.boxHelper);
    },

    onWindowResize(container) {
        if (!container) return;
        const w = container.clientWidth;
        const h = container.clientHeight;
        this.renderer.setSize(w, h, false);
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
    },

    render() {
        this.renderer.render(this.scene, this.camera);
    }
};

// Ініціалізація після завантаження сторінки
window.addEventListener('load', () => {
    SceneEngine.init('c', 'viewport-container');
});