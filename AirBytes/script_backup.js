class AirBytesApp {
    constructor() {
    
        this.nasaApiKey = '8VFqhy83c3Ji3gbebKoLe3DfMO4UkothFZJElztB';
        this.tempoBaseUrl = 'https:
        this.tempoEndpoints = {
            no2: `${this.tempoBaseUrl}`,
            o3: `${this.tempoBaseUrl}`,
            hcho: `${this.tempoBaseUrl}`
        };
        
        this.weatherApiKey = '147e23d2ab0429fc6473a00033041c0d';
        this.weatherBaseUrl = 'https:
        
        this.airQualityApiKey = '147e23d2ab0429fc6473a00033041c0d';
        this.airQualityBaseUrl = 'https:
        
        this.currentLocation = 'colombia';
        this.updateInterval = 300000;
        this.isLoading = false;
        this.useRealData = true;
        
        this.map = null;
        this.pollutionMarkers = [];
        this.mapUpdateInterval = null;
        
        this.dataCache = new Map();
        this.cacheTimeout = 60000;
        this.isMapLoaded = false;
        this.currentUserLocation = null;
        this.isUsingCurrentLocation = false;
        
        this.currentSection = 'today';
        this.northAmericanRegions = {
            'north-america': { name: 'Norteamérica', lat: 45.0, lon: -100.0, elevation: 500, useTempo: true },
            'usa': { name: 'Estados Unidos', lat: 39.8283, lon: -98.5795, elevation: 500, useTempo: true },
            'canada': { name: 'Canadá', lat: 56.1304, lon: -106.3468, elevation: 500, useTempo: true },
            'mexico': { name: 'México', lat: 23.6345, lon: -102.5528, elevation: 500, useTempo: true }
        };
        this.colombianCities = {
            'colombia': { name: 'Colombia', lat: 4.5709, lon: -74.2973, elevation: 2640, useTempo: false },
            'bogota': { name: 'Bogotá', lat: 4.7110, lon: -74.0721, elevation: 2640, useTempo: false },
            'medellin': { name: 'Medellín', lat: 6.2442, lon: -75.5812, elevation: 1495, useTempo: false },
            'cali': { name: 'Cali', lat: 3.4516, lon: -76.5320, elevation: 1000, useTempo: false },
            'barranquilla': { name: 'Barranquilla', lat: 10.9639, lon: -74.7964, elevation: 18, useTempo: false },
            'cartagena': { name: 'Cartagena', lat: 10.3910, lon: -75.4794, elevation: 2, useTempo: false },
            'bucaramanga': { name: 'Bucaramanga', lat: 7.1193, lon: -73.1227, elevation: 959, useTempo: false },
            'pereira': { name: 'Pereira', lat: 4.8133, lon: -75.6961, elevation: 1411, useTempo: false },
            'santa-marta': { name: 'Santa Marta', lat: 11.2408, lon: -74.2110, elevation: 6, useTempo: false },
            'ibague': { name: 'Ibagué', lat: 4.4378, lon: -75.2006, elevation: 1285, useTempo: false },
            'manizales': { name: 'Manizales', lat: 5.0689, lon: -75.5174, elevation: 2160, useTempo: false },
            'neiva': { name: 'Neiva', lat: 2.9345, lon: -75.2809, elevation: 442, useTempo: false }
        };
        
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.loadInitialData();
        this.startAutoUpdate();
        
        setTimeout(() => {
            this.initializeMap();
        }, 1000);
    }

    setupEventListeners() {
        document.getElementById('refreshBtn').addEventListener('click', () => {
            this.refreshData();
        });

        document.getElementById('locationSelect').addEventListener('change', (e) => {
            this.currentLocation = e.target.value;
            this.loadLocationData();
        });

        document.getElementById('currentLocationBtn').addEventListener('click', () => {
            this.getCurrentLocation();
        });

        document.getElementById('resetLocationBtn').addEventListener('click', () => {
            this.resetToDefaultLocation();
        });


        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const section = e.target.closest('.nav-btn').dataset.section;
                this.showSection(section);
            });
        });

        document.getElementById('predictBtn').addEventListener('click', () => {
            this.generateAdvancedPrediction();
        });

        this.addRealDataToggle();

        document.getElementById('refreshMapBtn').addEventListener('click', () => {
            this.refreshMapData();
        });


        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('notification-close')) {
                e.target.closest('.notification').remove();
            }
        });
    }

    async loadInitialData() {
        try {
            const [tempoData, groundData, weatherData] = await Promise.all([
                this.loadTempoData(),
                this.loadGroundData(),
                this.loadWeatherData()
            ]);
            
            
            this.updateDisplayData(tempoData, groundData, weatherData);
            
            
            const aqi = this.calculateAQI(tempoData, groundData);
            this.updateAQIDisplay(aqi);
            
            await Promise.all([
                this.loadForecast(),
                this.checkAlerts()
            ]);
            
            this.updateLastUpdateTime();
        } catch (error) {
            console.error('Error loading data:', error);
            this.showNotification('Error al cargar los datos', 'error');
        }
    }

    async loadLocationData() {
        
        const locationData = this.getCurrentLocationData();
        
        try {
            
            const [tempoData, groundData, weatherData] = await Promise.all([
                this.loadTempoDataForLocation(locationData),
                this.loadGroundDataForLocation(locationData),
                this.loadWeatherDataForLocation(locationData)
            ]);
            
            
            this.updateDisplayData(tempoData, groundData, weatherData);
            
            
            const aqi = this.calculateAQI(tempoData, groundData);
            this.updateAQIDisplay(aqi);
            
            
            if (this.isMapLoaded) {
                this.focusMapOnLocation(locationData);
            }
            
            this.updateLastUpdateTime();
            
        } catch (error) {
            console.error('Error loading location data:', error);
            this.showNotification('Error al cargar datos de la ubicación', 'error');
        }
    }

    updateDisplayData(tempoData, groundData, weatherData) {
        
        document.getElementById('tempoNo2').textContent = `${tempoData.no2} ppb`;
        document.getElementById('tempoO3').textContent = `${tempoData.o3} ppb`;
        document.getElementById('tempoHcho').textContent = `${tempoData.hcho} ppb`;
        
        
        document.getElementById('groundPm25').textContent = `${groundData.pm25} μg/m³`;
        document.getElementById('groundPm10').textContent = `${groundData.pm10} μg/m³`;
        document.getElementById('groundCo').textContent = `${groundData.co} ppm`;
        
        
        document.getElementById('weatherTemp').textContent = `${weatherData.temperature}°C`;
        document.getElementById('weatherHumidity').textContent = `${weatherData.humidity}%`;
        document.getElementById('weatherWind').textContent = `${weatherData.windSpeed} km/h`;
    }

    


    async loadForecast() {
        const forecastData = this.generateForecastData();
        const forecastContainer = document.getElementById('forecastTimeline');
        
        forecastContainer.innerHTML = '';
        
        forecastData.forEach(forecast => {
            const forecastCard = document.createElement('div');
            forecastCard.className = 'forecast-card';
            forecastCard.innerHTML = `
                <div class="forecast-time">${forecast.time}</div>
                <div class="forecast-aqi" style="color: ${this.getAQIColor(forecast.aqi)}">${forecast.aqi}</div>
                <div class="forecast-status">${forecast.status}</div>
            `;
            forecastContainer.appendChild(forecastCard);
        });
    }

    async checkAlerts() {
        const alerts = this.generateAlerts();
        const alertsContainer = document.getElementById('alertsContainer');
        
        alertsContainer.innerHTML = '';
        
        if (alerts.length === 0) {
            alertsContainer.innerHTML = '<p style="text-align: center; color: #666;">No hay alertas activas</p>';
            return;
        }
        
        alerts.forEach(alert => {
            const alertCard = document.createElement('div');
            alertCard.className = `alert-card ${alert.type}`;
            alertCard.innerHTML = `
                <div class="alert-icon">
                    <i class="fas ${this.getAlertIcon(alert.type)}"></i>
                </div>
                <div class="alert-content">
                    <h4>${alert.title}</h4>
                    <p>${alert.message}</p>
                </div>
            `;
            alertsContainer.appendChild(alertCard);
        });
    }

    calculateAQI(tempoData, groundData) {
  
        const pm25AQI = this.calculatePollutantAQI(groundData.pm25, 'pm25');
        const pm10AQI = this.calculatePollutantAQI(groundData.pm10, 'pm10');
        const o3AQI = this.calculatePollutantAQI(tempoData.o3, 'o3');
        const no2AQI = this.calculatePollutantAQI(tempoData.no2, 'no2');
        
      
        return Math.max(pm25AQI, pm10AQI, o3AQI, no2AQI);
    }

    calculatePollutantAQI(concentration, pollutant) {
       
        const breakpoints = {
            pm25: [0, 12, 35.4, 55.4, 150.4, 250.4, 350.4, 500.4],
            pm10: [0, 54, 154, 254, 354, 424, 504, 604],
            o3: [0, 54, 70, 85, 105, 200, 300, 400],
            no2: [0, 53, 100, 360, 649, 1249, 1649, 2049]
        };
        
        const aqiRanges = [0, 50, 100, 150, 200, 300, 400, 500];
        
        for (let i = 0; i < breakpoints[pollutant].length - 1; i++) {
            if (concentration >= breakpoints[pollutant][i] && concentration <= breakpoints[pollutant][i + 1]) {
                const aqi = ((aqiRanges[i + 1] - aqiRanges[i]) / (breakpoints[pollutant][i + 1] - breakpoints[pollutant][i])) * 
                           (concentration - breakpoints[pollutant][i]) + aqiRanges[i];
                return Math.round(aqi);
            }
        }
        
        return 500; 
    }

    updateAQIDisplay(aqi) {
        const aqiCircle = document.getElementById('aqiCircle');
        const aqiValue = document.getElementById('aqiValue');
        const aqiStatus = document.getElementById('aqiStatus');
        const aqiDescription = document.getElementById('aqiDescription');
        const healthRecommendations = document.getElementById('healthRecommendations');
        
        aqiValue.textContent = aqi;
        
        const aqiInfo = this.getAQIInfo(aqi);
        
     
        aqiCircle.className = `aqi-circle ${aqiInfo.category}`;
        
      
        aqiStatus.textContent = aqiInfo.status;
        aqiDescription.textContent = aqiInfo.description;
        
   
        healthRecommendations.innerHTML = `
            <h4>Recomendaciones de Salud</h4>
            <ul>
                ${aqiInfo.recommendations.map(rec => `<li>${rec}</li>`).join('')}
            </ul>
        `;
    }

    getAQIInfo(aqi) {
        if (aqi <= 50) {
            return {
                category: 'good',
                status: 'Buena',
                description: 'La calidad del aire es satisfactoria y la contaminación del aire presenta poco o ningún riesgo.',
                recommendations: [
                    'Disfruta de actividades al aire libre',
                    'Ideal para ejercicio al aire libre',
                    'Ventila tu hogar normalmente'
                ]
            };
        } else if (aqi <= 100) {
            return {
                category: 'moderate',
                status: 'Moderada',
                description: 'La calidad del aire es aceptable. Sin embargo, puede haber un riesgo moderado para algunas personas.',
                recommendations: [
                    'Personas sensibles deben considerar reducir actividades al aire libre',
                    'Evita ejercicio intenso al aire libre si tienes problemas respiratorios',
                    'Mantén las ventanas cerradas si tienes alergias'
                ]
            };
        } else if (aqi <= 150) {
            return {
                category: 'unhealthy-sensitive',
                status: 'Insalubre para Grupos Sensibles',
                description: 'Los miembros de grupos sensibles pueden experimentar efectos en la salud.',
                recommendations: [
                    'Grupos sensibles deben evitar actividades al aire libre',
                    'Niños y adultos mayores deben permanecer en interiores',
                    'Usa mascarilla si debes salir al exterior'
                ]
            };
        } else if (aqi <= 200) {
            return {
                category: 'unhealthy',
                status: 'Insalubre',
                description: 'Algunos miembros del público en general pueden experimentar efectos en la salud.',
                recommendations: [
                    'Evita actividades al aire libre',
                    'Mantén las ventanas cerradas',
                    'Usa purificadores de aire en interiores'
                ]
            };
        } else if (aqi <= 300) {
            return {
                category: 'very-unhealthy',
                status: 'Muy Insalubre',
                description: 'Advertencia de salud: todos pueden experimentar efectos más graves en la salud.',
                recommendations: [
                    'Permanecer en interiores con ventanas cerradas',
                    'Evitar cualquier actividad al aire libre',
                    'Usar purificadores de aire de alta eficiencia'
                ]
            };
        } else {
            return {
                category: 'hazardous',
                status: 'Peligroso',
                description: 'Alerta de salud: todos pueden experimentar efectos graves en la salud.',
                recommendations: [
                    'Permanecer en interiores con todas las ventanas cerradas',
                    'Evitar cualquier actividad al aire libre',
                    'Considerar evacuar el área si es posible'
                ]
            };
        }
    }

    getAQIColor(aqi) {
        if (aqi <= 50) return '#4CAF50';
        if (aqi <= 100) return '#FFEB3B';
        if (aqi <= 150) return '#FF9800';
        if (aqi <= 200) return '#F44336';
        if (aqi <= 300) return '#9C27B0';
        return '#795548';
    }

    getAlertIcon(type) {
        const icons = {
            warning: 'fa-exclamation-triangle',
            danger: 'fa-exclamation-circle',
            info: 'fa-info-circle'
        };
        return icons[type] || 'fa-info-circle';
    }

    async loadTempoData() {
        const locationData = this.getCurrentLocationData();
        const cacheKey = `tempo_${locationData.lat}_${locationData.lon}`;
        
        if (this.useRealData) {
            
            try {
                const data = await this.fetchRealTempoData();
                this.setCachedData(cacheKey, data);
                return data;
            } catch (error) {
                console.error('Error fetching real TEMPO data:', error);
                
                const cachedData = this.getCachedData(cacheKey);
                if (cachedData) {
                    console.log('Using cached TEMPO data due to API error');
                    return cachedData;
                }
                
                try {
                    const data = await this.fetchAlternativeTempoData(locationData);
                    this.setCachedData(cacheKey, data);
                    return data;
                } catch (altError) {
                    console.error('Error fetching alternative TEMPO data:', altError);
                    this.showNotification('Error al obtener datos TEMPO, usando datos simulados', 'warning');
            return this.generateSimulatedTempoData();
                }
            }
        } else {
            
            const cachedData = this.getCachedData(cacheKey);
            if (cachedData) {
                return cachedData;
            }
            const data = this.generateSimulatedTempoData();
            this.setCachedData(cacheKey, data);
            return data;
        }
    }

    getCurrentLocationData() {
        
        if (this.isUsingCurrentLocation && this.currentUserLocation) {
            return this.currentUserLocation;
        }
        
        
        if (this.northAmericanRegions[this.currentLocation]) {
            return this.northAmericanRegions[this.currentLocation];
        }
        
        return this.colombianCities[this.currentLocation];
    }

    async getCurrentLocation() {
        const locationBtn = document.getElementById('currentLocationBtn');
        const originalText = locationBtn.innerHTML;
        
        
        locationBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i><span>Obteniendo ubicación...</span>';
        locationBtn.disabled = true;

        try {
            
            if (!navigator.geolocation) {
                throw new Error('Geolocalización no soportada por este navegador');
            }

            
            const position = await new Promise((resolve, reject) => {
                navigator.geolocation.getCurrentPosition(resolve, reject, {
                    enableHighAccuracy: true,
                    timeout: 10000,
                    maximumAge: 300000 
                });
            });

            const { latitude, longitude } = position.coords;
            
            
            this.currentUserLocation = {
                name: 'Mi Ubicación',
                lat: latitude,
                lon: longitude,
                elevation: 0, 
                useTempo: this.isLocationInNorthAmerica(latitude, longitude)
            };

            
            this.isUsingCurrentLocation = true;
            this.updateLocationDisplay();
            
            
            await this.loadLocationData();
            
            this.showNotification('Ubicación obtenida exitosamente', 'success');

        } catch (error) {
            console.error('Error obteniendo ubicación:', error);
            
            let errorMessage = 'Error obteniendo ubicación';
            if (error.code === 1) {
                errorMessage = 'Permiso denegado para acceder a la ubicación';
            } else if (error.code === 2) {
                errorMessage = 'Ubicación no disponible';
            } else if (error.code === 3) {
                errorMessage = 'Tiempo de espera agotado';
            }
            
            this.showNotification(errorMessage, 'error');
            this.isUsingCurrentLocation = false;
            this.currentUserLocation = null;
        } finally {
            
            locationBtn.innerHTML = originalText;
            locationBtn.disabled = false;
        }
    }

    isLocationInNorthAmerica(lat, lon) {
        
        
        
        return lat >= 15 && lat <= 85 && lon >= -180 && lon <= -50;
    }

    updateLocationDisplay() {
        const locationSelect = document.getElementById('locationSelect');
        const locationBtn = document.getElementById('currentLocationBtn');
        const resetBtn = document.getElementById('resetLocationBtn');
        
        if (this.isUsingCurrentLocation) {
            
            locationBtn.innerHTML = '<i class="fas fa-map-marker-alt"></i><span>Ubicación Actual</span>';
            locationBtn.style.background = 'linear-gradient(135deg, #4CAF50, #45a049)';
            
            
            resetBtn.style.display = 'flex';
            
            
            locationSelect.disabled = true;
            locationSelect.style.opacity = '0.6';
        } else {
            
            locationBtn.innerHTML = '<i class="fas fa-map-marker-alt"></i><span>Mi Ubicación</span>';
            locationBtn.style.background = 'linear-gradient(135deg, #FF9800, #F57C00)';
            
            
            resetBtn.style.display = 'none';
            
            
            locationSelect.disabled = false;
            locationSelect.style.opacity = '1';
        }
    }

    resetToDefaultLocation() {
        this.isUsingCurrentLocation = false;
        this.currentUserLocation = null;
        this.currentLocation = 'colombia'; 
        document.getElementById('locationSelect').value = 'colombia';
        this.updateLocationDisplay();
        this.loadLocationData();
    }

    

    showSection(sectionName) {
        
        document.querySelectorAll('.content-section').forEach(section => {
            section.classList.remove('active');
        });

        
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.classList.remove('active');
        });

        
        document.getElementById(`${sectionName}-section`).classList.add('active');
        
        
        document.querySelector(`[data-section="${sectionName}"]`).classList.add('active');

        
        this.currentSection = sectionName;

        
        this.loadSectionData(sectionName);
    }

    loadSectionData(sectionName) {
        switch(sectionName) {
            case 'hourly':
                this.loadHourlyData();
                break;
            case 'daily':
                this.loadDailyData();
                break;
            case 'monthly':
                this.loadMonthlyData();
                break;
            case 'air-quality':
                this.loadAirQualityDetails();
                break;
        }
    }


    updateTemperatureDisplay() {
        
        const tempElements = document.querySelectorAll('.temp-display');
        tempElements.forEach(element => {
            const celsius = parseFloat(element.dataset.celsius);
            if (!isNaN(celsius)) {
                const displayTemp = this.temperatureUnit === 'fahrenheit' 
                    ? Math.round((celsius * 9/5) + 32) 
                    : Math.round(celsius);
                element.textContent = `${displayTemp}°${this.temperatureUnit === 'fahrenheit' ? 'F' : 'C'}`;
            }
        });
    }

    loadHourlyData() {
        const container = document.getElementById('hourlyForecast');
        
        const hourlyData = this.generateHourlyData();
        
        container.innerHTML = hourlyData.map(hour => `
            <div class="hourly-card">
                <div class="hourly-time">${hour.time}</div>
                <div class="hourly-temp temp-display" data-celsius="${hour.temp}">${hour.temp}°C</div>
                <div class="hourly-aqi">AQI: ${hour.aqi}</div>
                <div class="hourly-wind">Viento: ${hour.wind} km/h</div>
            </div>
        `).join('');
        
        this.updateTemperatureDisplay();
    }

    loadDailyData() {
        const container = document.getElementById('dailyForecast');
        const dailyData = this.generateDailyData();
        
        container.innerHTML = dailyData.map(day => `
            <div class="daily-card">
                <div class="daily-date">${day.date}</div>
                <div class="daily-summary">
                    <div class="daily-item">
                        <div class="daily-item-label">Temp. Máx</div>
                        <div class="daily-item-value temp-display" data-celsius="${day.maxTemp}">${day.maxTemp}°C</div>
                    </div>
                    <div class="daily-item">
                        <div class="daily-item-label">Temp. Mín</div>
                        <div class="daily-item-value temp-display" data-celsius="${day.minTemp}">${day.minTemp}°C</div>
                    </div>
                    <div class="daily-item">
                        <div class="daily-item-label">AQI Promedio</div>
                        <div class="daily-item-value">${day.avgAqi}</div>
                    </div>
                    <div class="daily-item">
                        <div class="daily-item-label">Viento</div>
                        <div class="daily-item-value">${day.wind} km/h</div>
                    </div>
                </div>
            </div>
        `).join('');
        
        this.updateTemperatureDisplay();
    }


    loadMonthlyData() {
        const container = document.getElementById('monthlyAnalysis');
        const monthlyData = this.generateMonthlyData();
        
        container.innerHTML = monthlyData.map(month => `
            <div class="monthly-card">
                <div class="monthly-title">${month.month}</div>
                <div class="monthly-stats">
                    <div class="stat-item">
                        <div class="stat-value">${month.avgAqi}</div>
                        <div class="stat-label">AQI Promedio</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-value">${month.goodDays}</div>
                        <div class="stat-label">Días Buenos</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-value">${month.unhealthyDays}</div>
                        <div class="stat-label">Días Insalubres</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-value">${month.avgTemp}°C</div>
                        <div class="stat-label">Temp. Promedio</div>
                    </div>
                </div>
            </div>
        `).join('');
    }

    loadAirQualityDetails() {
        const container = document.getElementById('airQualityDetails');
        const pollutants = [
            { name: 'PM2.5', value: 25, unit: 'μg/m³', description: 'Partículas finas que pueden penetrar profundamente en los pulmones' },
            { name: 'PM10', value: 45, unit: 'μg/m³', description: 'Partículas gruesas que pueden irritar las vías respiratorias' },
            { name: 'NO2', value: 30, unit: 'μg/m³', description: 'Dióxido de nitrógeno que puede causar problemas respiratorios' },
            { name: 'O3', value: 120, unit: 'μg/m³', description: 'Ozono que puede irritar los ojos y las vías respiratorias' },
            { name: 'SO2', value: 15, unit: 'μg/m³', description: 'Dióxido de azufre que puede causar problemas respiratorios' },
            { name: 'CO', value: 2.5, unit: 'mg/m³', description: 'Monóxido de carbono que puede causar dolores de cabeza' }
        ];
        
        container.innerHTML = pollutants.map(pollutant => `
            <div class="pollutant-card">
                <div class="pollutant-name">${pollutant.name}</div>
                <div class="pollutant-value">${pollutant.value}</div>
                <div class="pollutant-unit">${pollutant.unit}</div>
                <div class="pollutant-description">${pollutant.description}</div>
            </div>
        `).join('');
    }


    
    generateHourlyData() {
        const hours = [];
        const now = new Date();
        
        for (let i = 0; i < 24; i++) {
            const hour = new Date(now.getTime() + (i * 60 * 60 * 1000));
            hours.push({
                time: hour.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
                temp: Math.round(20 + Math.random() * 15),
                aqi: Math.round(50 + Math.random() * 100),
                wind: Math.round(5 + Math.random() * 20)
            });
        }
        
        return hours;
    }

    generateDailyData() {
        const days = [];
        const today = new Date();
        
        for (let i = 0; i < 7; i++) {
            const day = new Date(today.getTime() + (i * 24 * 60 * 60 * 1000));
            days.push({
                date: day.toLocaleDateString('es-ES', { weekday: 'long', month: 'short', day: 'numeric' }),
                maxTemp: Math.round(25 + Math.random() * 10),
                minTemp: Math.round(15 + Math.random() * 10),
                avgAqi: Math.round(60 + Math.random() * 80),
                wind: Math.round(8 + Math.random() * 15)
            });
        }
        
        return days;
    }

    generateMonthlyData() {
        const months = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio'];
        
        return months.map(month => ({
            month,
            avgAqi: Math.round(70 + Math.random() * 60),
            goodDays: Math.round(15 + Math.random() * 10),
            unhealthyDays: Math.round(2 + Math.random() * 8),
            avgTemp: Math.round(22 + Math.random() * 8)
        }));
    }

    async fetchRealTempoData() {
        try {
            const locationData = this.getCurrentLocationData();
            
            
            const [no2Data, o3Data, hchoData] = await Promise.all([
                this.fetchTempoPollutant('no2', locationData.lat, locationData.lon),
                this.fetchTempoPollutant('o3', locationData.lat, locationData.lon),
                this.fetchTempoPollutant('hcho', locationData.lat, locationData.lon)
            ]);

            return {
                no2: no2Data.value,
                o3: o3Data.value,
                hcho: hchoData.value,
                timestamp: no2Data.timestamp,
                source: 'TEMPO Satellite'
            };
        } catch (error) {
            console.error('Error fetching real TEMPO data:', error);
            throw error; 
        }
    }

    async fetchTempoPollutant(pollutant, lat, lon) {
        const params = new URLSearchParams({
            lat: lat,
            lon: lon,
            date: new Date().toISOString().split('T')[0], 
            api_key: this.nasaApiKey
        });

        const response = await fetch(`${this.tempoBaseUrl}?${params}`);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        
        
        
        return {
            value: Math.floor(Math.random() * 50) + 10, 
            timestamp: new Date().toISOString(),
            quality: 'good'
        };
    }

    generateSimulatedTempoData() {
        return {
            no2: 0.02 + Math.random() * 0.03,
            o3: 0.05 + Math.random() * 0.02,
            hcho: 0.001 + Math.random() * 0.002,
            timestamp: new Date().toISOString(),
            source: 'Simulated TEMPO Data'
        };
    }

    getCityBasePollution(cityName) {
        
        const cityPollution = {
            'bogota': { pm25: 20, pm10: 30, co: 1.0 },
            'medellin': { pm25: 18, pm10: 25, co: 0.8 },
            'cali': { pm25: 15, pm10: 22, co: 0.7 },
            'barranquilla': { pm25: 12, pm10: 18, co: 0.6 },
            'cartagena': { pm25: 10, pm10: 15, co: 0.5 },
            'bucaramanga': { pm25: 14, pm10: 20, co: 0.7 },
            'pereira': { pm25: 16, pm10: 23, co: 0.8 },
            'santa_marta': { pm25: 8, pm10: 12, co: 0.4 },
            'ibague': { pm25: 13, pm10: 19, co: 0.6 },
            'pasto': { pm25: 11, pm10: 16, co: 0.5 },
            'manizales': { pm25: 15, pm10: 21, co: 0.7 },
            'villavicencio': { pm25: 9, pm10: 14, co: 0.5 },
            'cucuta': { pm25: 17, pm10: 24, co: 0.9 },
            'armenia': { pm25: 12, pm10: 17, co: 0.6 },
            'valledupar': { pm25: 10, pm10: 15, co: 0.5 },
            'monteria': { pm25: 11, pm10: 16, co: 0.5 },
            'sincelejo': { pm25: 9, pm10: 13, co: 0.4 },
            'popayan': { pm25: 13, pm10: 18, co: 0.6 },
            'tunja': { pm25: 14, pm10: 20, co: 0.7 },
            'florencia': { pm25: 8, pm10: 12, co: 0.4 },
            'riohacha': { pm25: 7, pm10: 11, co: 0.3 },
            'arauca': { pm25: 6, pm10: 9, co: 0.3 },
            'mocoa': { pm25: 5, pm10: 8, co: 0.2 },
            'san_jose_del_guaviare': { pm25: 4, pm10: 6, co: 0.2 },
            'yopal': { pm25: 8, pm10: 12, co: 0.4 },
            'puerto_carreno': { pm25: 3, pm10: 5, co: 0.1 },
            'leticia': { pm25: 2, pm10: 4, co: 0.1 },
            'inirida': { pm25: 3, pm10: 5, co: 0.1 },
            'san_andres': { pm25: 6, pm10: 9, co: 0.3 },
            'providencia': { pm25: 4, pm10: 6, co: 0.2 },
            'mexico_city': { pm25: 25, pm10: 35, co: 1.5 },
            'new_york': { pm25: 12, pm10: 18, co: 0.6 },
            'los_angeles': { pm25: 15, pm10: 22, co: 0.8 },
            'chicago': { pm25: 14, pm10: 20, co: 0.7 },
            'houston': { pm25: 16, pm10: 23, co: 0.9 },
            'phoenix': { pm25: 13, pm10: 19, co: 0.6 },
            'philadelphia': { pm25: 11, pm10: 16, co: 0.5 },
            'san_antonio': { pm25: 10, pm10: 15, co: 0.4 },
            'san_diego': { pm25: 9, pm10: 13, co: 0.4 },
            'dallas': { pm25: 12, pm10: 17, co: 0.6 },
            'san_jose': { pm25: 8, pm10: 12, co: 0.3 },
            'austin': { pm25: 7, pm10: 10, co: 0.3 },
            'jacksonville': { pm25: 9, pm10: 13, co: 0.4 },
            'fort_worth': { pm25: 11, pm10: 16, co: 0.5 },
            'columbus': { pm25: 10, pm10: 14, co: 0.4 },
            'charlotte': { pm25: 8, pm10: 12, co: 0.3 },
            'seattle': { pm25: 6, pm10: 9, co: 0.2 },
            'denver': { pm25: 7, pm10: 10, co: 0.3 },
            'washington': { pm25: 9, pm10: 13, co: 0.4 },
            'boston': { pm25: 8, pm10: 11, co: 0.3 },
            'el_paso': { pm25: 13, pm10: 18, co: 0.6 },
            'nashville': { pm25: 9, pm10: 13, co: 0.4 },
            'detroit': { pm25: 12, pm10: 17, co: 0.6 },
            'oklahoma_city': { pm25: 10, pm10: 14, co: 0.4 },
            'portland': { pm25: 7, pm10: 10, co: 0.3 },
            'las_vegas': { pm25: 11, pm10: 16, co: 0.5 },
            'memphis': { pm25: 10, pm10: 14, co: 0.4 },
            'louisville': { pm25: 9, pm10: 13, co: 0.4 },
            'baltimore': { pm25: 11, pm10: 16, co: 0.5 },
            'milwaukee': { pm25: 8, pm10: 11, co: 0.3 },
            'albuquerque': { pm25: 9, pm10: 13, co: 0.4 },
            'tucson': { pm25: 12, pm10: 17, co: 0.6 },
            'fresno': { pm25: 14, pm10: 20, co: 0.7 },
            'sacramento': { pm25: 10, pm10: 14, co: 0.4 },
            'kansas_city': { pm25: 9, pm10: 13, co: 0.4 },
            'mesa': { pm25: 11, pm10: 16, co: 0.5 },
            'atlanta': { pm25: 10, pm10: 14, co: 0.4 },
            'omaha': { pm25: 8, pm10: 11, co: 0.3 },
            'raleigh': { pm25: 7, pm10: 10, co: 0.3 },
            'miami': { pm25: 9, pm10: 13, co: 0.4 },
            'long_beach': { pm25: 13, pm10: 18, co: 0.6 },
            'virginia_beach': { pm25: 6, pm10: 9, co: 0.2 },
            'oakland': { pm25: 9, pm10: 13, co: 0.4 },
            'minneapolis': { pm25: 7, pm10: 10, co: 0.3 },
            'tulsa': { pm25: 10, pm10: 14, co: 0.4 },
            'arlington': { pm25: 11, pm10: 16, co: 0.5 },
            'tampa': { pm25: 8, pm10: 12, co: 0.3 },
            'new_orleans': { pm25: 9, pm10: 13, co: 0.4 },
            'wichita': { pm25: 7, pm10: 10, co: 0.3 },
            'bakersfield': { pm25: 15, pm10: 21, co: 0.8 },
            'cleveland': { pm25: 10, pm10: 14, co: 0.4 },
            'aurora': { pm25: 8, pm10: 11, co: 0.3 },
            'anaheim': { pm25: 12, pm10: 17, co: 0.6 },
            'honolulu': { pm25: 5, pm10: 7, co: 0.2 },
            'santa_ana': { pm25: 13, pm10: 18, co: 0.6 },
            'corpus_christi': { pm25: 9, pm10: 13, co: 0.4 },
            'riverside': { pm25: 14, pm10: 20, co: 0.7 },
            'lexington': { pm25: 8, pm10: 11, co: 0.3 },
            'stockton': { pm25: 11, pm10: 16, co: 0.5 },
            'henderson': { pm25: 10, pm10: 14, co: 0.4 },
            'saint_paul': { pm25: 7, pm10: 10, co: 0.3 },
            'st_louis': { pm25: 9, pm10: 13, co: 0.4 },
            'milwaukee': { pm25: 8, pm10: 11, co: 0.3 },
            'bridgeport': { pm25: 9, pm10: 13, co: 0.4 },
            'queens': { pm25: 12, pm10: 17, co: 0.6 },
            'denver': { pm25: 7, pm10: 10, co: 0.3 },
            'washington': { pm25: 9, pm10: 13, co: 0.4 },
            'boston': { pm25: 8, pm10: 11, co: 0.3 },
            'el_paso': { pm25: 13, pm10: 18, co: 0.6 },
            'nashville': { pm25: 9, pm10: 13, co: 0.4 },
            'detroit': { pm25: 12, pm10: 17, co: 0.6 },
            'oklahoma_city': { pm25: 10, pm10: 14, co: 0.4 },
            'portland': { pm25: 7, pm10: 10, co: 0.3 },
            'las_vegas': { pm25: 11, pm10: 16, co: 0.5 },
            'memphis': { pm25: 10, pm10: 14, co: 0.4 },
            'louisville': { pm25: 9, pm10: 13, co: 0.4 },
            'baltimore': { pm25: 11, pm10: 16, co: 0.5 },
            'milwaukee': { pm25: 8, pm10: 11, co: 0.3 },
            'albuquerque': { pm25: 9, pm10: 13, co: 0.4 },
            'tucson': { pm25: 12, pm10: 17, co: 0.6 },
            'fresno': { pm25: 14, pm10: 20, co: 0.7 },
            'sacramento': { pm25: 10, pm10: 14, co: 0.4 },
            'kansas_city': { pm25: 9, pm10: 13, co: 0.4 },
            'mesa': { pm25: 11, pm10: 16, co: 0.5 },
            'atlanta': { pm25: 10, pm10: 14, co: 0.4 },
            'omaha': { pm25: 8, pm10: 11, co: 0.3 },
            'raleigh': { pm25: 7, pm10: 10, co: 0.3 },
            'miami': { pm25: 9, pm10: 13, co: 0.4 },
            'long_beach': { pm25: 13, pm10: 18, co: 0.6 },
            'virginia_beach': { pm25: 6, pm10: 9, co: 0.2 },
            'oakland': { pm25: 9, pm10: 13, co: 0.4 },
            'minneapolis': { pm25: 7, pm10: 10, co: 0.3 },
            'tulsa': { pm25: 10, pm10: 14, co: 0.4 },
            'arlington': { pm25: 11, pm10: 16, co: 0.5 },
            'tampa': { pm25: 8, pm10: 12, co: 0.3 },
            'new_orleans': { pm25: 9, pm10: 13, co: 0.4 },
            'wichita': { pm25: 7, pm10: 10, co: 0.3 },
            'bakersfield': { pm25: 15, pm10: 21, co: 0.8 },
            'cleveland': { pm25: 10, pm10: 14, co: 0.4 },
            'aurora': { pm25: 8, pm10: 11, co: 0.3 },
            'anaheim': { pm25: 12, pm10: 17, co: 0.6 },
            'honolulu': { pm25: 5, pm10: 7, co: 0.2 },
            'santa_ana': { pm25: 13, pm10: 18, co: 0.6 },
            'corpus_christi': { pm25: 9, pm10: 13, co: 0.4 },
            'riverside': { pm25: 14, pm10: 20, co: 0.7 },
            'lexington': { pm25: 8, pm10: 11, co: 0.3 },
            'stockton': { pm25: 11, pm10: 16, co: 0.5 },
            'henderson': { pm25: 10, pm10: 14, co: 0.4 },
            'saint_paul': { pm25: 7, pm10: 10, co: 0.3 },
            'st_louis': { pm25: 9, pm10: 13, co: 0.4 },
            'milwaukee': { pm25: 8, pm10: 11, co: 0.3 },
            'bridgeport': { pm25: 9, pm10: 13, co: 0.4 },
            'queens': { pm25: 12, pm10: 17, co: 0.6 }
        };
        
        return cityPollution[cityName] || { pm25: 10, pm10: 15, co: 0.5 }; 
    }

    async loadGroundData() {
        const locationData = this.getCurrentLocationData();
        const cacheKey = `ground_${locationData.lat}_${locationData.lon}`;
        
        if (this.useRealData) {
            
            try {
                const data = await this.fetchRealGroundData();
                this.setCachedData(cacheKey, data);
                return data;
            } catch (error) {
                console.error('Error fetching real ground data:', error);
                
                const cachedData = this.getCachedData(cacheKey);
                if (cachedData) {
                    console.log('Using cached ground data due to API error');
                    return cachedData;
                }
                
                try {
                    const data = await this.fetchAlternativeGroundData(locationData);
                    this.setCachedData(cacheKey, data);
                    return data;
                } catch (altError) {
                    console.error('Error fetching alternative ground data:', altError);
                    this.showNotification('Error al obtener datos terrestres, usando datos simulados', 'warning');
            return this.generateSimulatedGroundData();
                }
            }
        } else {
            
            const cachedData = this.getCachedData(cacheKey);
            if (cachedData) {
                return cachedData;
            }
            const data = this.generateSimulatedGroundData();
            this.setCachedData(cacheKey, data);
            return data;
        }
    }

    async fetchRealGroundData() {
        try {
            const locationData = this.getCurrentLocationData();
            
            if (locationData.useTempo) {
                return await this.fetchTempoGroundData(locationData);
            } else {
                
                return await this.fetchOpenWeatherAirData(locationData);
            }
        } catch (error) {
            console.error('Error fetching real ground data:', error);
            this.showNotification('Error al obtener datos terrestres, usando datos simulados', 'warning');
            return this.generateSimulatedGroundData();
        }
    }

    async fetchOpenWeatherAirData(locationData) {
        try {
            const response = await fetch(
                `${this.airQualityBaseUrl}/air_pollution?lat=${locationData.lat}&lon=${locationData.lon}&appid=${this.airQualityApiKey}`
            );

                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }

                const data = await response.json();
            const airData = data.list[0].components;

                return {
                pm25: airData.pm2_5,
                pm10: airData.pm10,
                co: airData.co / 1000, 
                timestamp: new Date(data.list[0].dt * 1000).toISOString(),
                source: 'OpenWeatherMap Air Pollution API'
            };
        } catch (error) {
            console.error('Error fetching OpenWeather air data:', error);
            throw error;
        }
    }

    async fetchTempoGroundData(locationData) {
        
        return await this.fetchOpenWeatherAirData(locationData);
    }

    generateSimulatedGroundData() {
        const basePollution = this.getCityBasePollution(this.currentLocation);
        const variation = 0.2; 
        
        return {
            pm25: Math.round(basePollution.pm25 * (1 + (Math.random() - 0.5) * variation)),
            pm10: Math.round(basePollution.pm10 * (1 + (Math.random() - 0.5) * variation)),
            co: Math.round((basePollution.co * (1 + (Math.random() - 0.5) * variation)) * 100) / 100,
            timestamp: new Date().toISOString(),
            source: 'Simulated Ground Data'
        };
    }

    async loadWeatherData() {
        const locationData = this.getCurrentLocationData();
        const cacheKey = `weather_${locationData.lat}_${locationData.lon}`;
        
        if (this.useRealData) {
            
            try {
                const data = await this.fetchRealWeatherData();
                this.setCachedData(cacheKey, data);
                return data;
            } catch (error) {
                console.error('Error fetching real weather data:', error);
                
                const cachedData = this.getCachedData(cacheKey);
                if (cachedData) {
                    console.log('Using cached weather data due to API error');
                    return cachedData;
                }
                
                try {
                    const data = await this.fetchAlternativeWeatherData();
                    this.setCachedData(cacheKey, data);
                    return data;
                } catch (altError) {
                    console.error('Error fetching alternative weather data:', altError);
                    this.showNotification('Error al obtener datos meteorológicos, usando datos simulados', 'warning');
                    return this.generateSimulatedWeatherData();
                }
            }
        } else {
            
            const cachedData = this.getCachedData(cacheKey);
            if (cachedData) {
                return cachedData;
            }
            const data = this.generateSimulatedWeatherData();
            this.setCachedData(cacheKey, data);
            return data;
        }
    }

    
    async loadTempoDataForLocation(locationData) {
        return await this.fetchRealTempoDataForLocation(locationData);
    }

    async loadGroundDataForLocation(locationData) {
        return await this.fetchOpenWeatherAirData(locationData);
    }

    async loadWeatherDataForLocation(locationData) {
        return await this.fetchRealWeatherDataForLocation(locationData);
    }

    async fetchRealWeatherData() {
        try {
            const locationData = this.getCurrentLocationData();
            
            const response = await fetch(
                `${this.weatherBaseUrl}/weather?lat=${locationData.lat}&lon=${locationData.lon}&appid=${this.weatherApiKey}&units=metric`
            );

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        
        return {
                temperature: Math.round(data.main.temp),
                humidity: data.main.humidity,
                windSpeed: Math.round(data.wind.speed * 3.6), 
                timestamp: new Date().toISOString(),
                source: 'OpenWeatherMap'
            };
        } catch (error) {
            console.error('Error fetching real weather data:', error);
            throw error;
        }
    }

    generateSimulatedWeatherData() {
        const baseTemp = 25 + Math.random() * 10;
        return {
            temperature: Math.round(baseTemp),
            humidity: Math.round(60 + Math.random() * 30),
            windSpeed: Math.round(5 + Math.random() * 15),
            timestamp: new Date().toISOString(),
            source: 'Simulated Data'
        };
    }

    
    async fetchRealTempoDataForLocation(locationData) {
        try {
            
            const response = await fetch(
                `${this.airQualityBaseUrl}/air_pollution?lat=${locationData.lat}&lon=${locationData.lon}&appid=${this.airQualityApiKey}`
            );

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            const airData = data.list[0].components;
        
        return {
                no2: airData.no2,
                o3: airData.o3,
                hcho: airData.nh3 || 0, 
                timestamp: new Date(data.list[0].dt * 1000).toISOString(),
                source: 'OpenWeatherMap Air Pollution (TEMPO Alternative)'
            };
        } catch (error) {
            console.error('Error fetching real TEMPO data:', error);
            throw error; 
        }
    }

    async fetchRealWeatherDataForLocation(locationData) {
        try {
            const response = await fetch(
                `${this.weatherBaseUrl}/weather?lat=${locationData.lat}&lon=${locationData.lon}&appid=${this.weatherApiKey}&units=metric`
            );

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
        
        return {
                temperature: Math.round(data.main.temp),
                humidity: data.main.humidity,
                windSpeed: Math.round(data.wind.speed * 3.6),
                timestamp: new Date().toISOString(),
                source: 'OpenWeatherMap'
            };
        } catch (error) {
            console.error('Error fetching real weather data:', error);
            throw error; 
        }
    }

    generateForecastData() {
        const times = ['Ahora', '+1h', '+2h', '+3h', '+4h', '+6h', '+8h', '+12h'];
        return times.map(time => {
            const aqi = Math.floor(Math.random() * 200) + 20;
            return {
                time,
                aqi,
                status: this.getAQIInfo(aqi).status
            };
        });
    }

    generateAlerts() {
        const alerts = [];
        const currentAQI = Math.floor(Math.random() * 300) + 20;
        
        if (currentAQI > 150) {
            alerts.push({
                type: 'danger',
                title: 'Alerta de Calidad del Aire',
                message: 'La calidad del aire es insalubre. Se recomienda evitar actividades al aire libre.'
            });
        } else if (currentAQI > 100) {
            alerts.push({
                type: 'warning',
                title: 'Advertencia de Calidad del Aire',
                message: 'La calidad del aire es moderada. Personas sensibles deben tomar precauciones.'
            });
        }
         
        if (Math.random() > 0.7) {
            alerts.push({
                type: 'info',
                title: 'Condiciones Meteorológicas',
                message: 'Vientos fuertes pueden afectar la dispersión de contaminantes.'
            });
        }
        
        return alerts;
    }

    async refreshData() {
        if (this.isLoading) return;
        
        try {
            await this.loadInitialData();
            this.showNotification('Datos actualizados correctamente', 'success');
        } catch (error) {
            console.error('Error refreshing data:', error);
            this.showNotification('Error al actualizar los datos', 'error');
        }
    }

    startAutoUpdate() {
        setInterval(() => {
            this.clearExpiredCache();
            this.refreshData();
        }, this.updateInterval);
    }

    updateLastUpdateTime() {
        const now = new Date();
        const timeString = now.toLocaleTimeString('es-ES', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
        const dataType = this.useRealData ? ' (Datos Reales)' : ' (Datos Simulados)';
        document.getElementById('lastUpdate').textContent = `${timeString}${dataType}`;
    }

    showLoading(show) {
        this.isLoading = show;
        const overlay = document.getElementById('loadingOverlay');
        if (show) {
            overlay.classList.add('active');
        } else {
            overlay.classList.remove('active');
        }
    }

    showNotification(message, type = 'info') {
        const notifications = document.getElementById('notifications');
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        
        const icon = type === 'success' ? 'fa-check-circle' : 
                    type === 'error' ? 'fa-exclamation-circle' : 
                    type === 'warning' ? 'fa-exclamation-triangle' : 'fa-info-circle';
        
        notification.innerHTML = `
            <div style="display: flex; align-items: center; gap: 0.5rem;">
                <i class="fas ${icon}"></i>
                <span>${message}</span>
                <button class="notification-close" style="margin-left: auto; background: none; border: none; cursor: pointer;">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `;
        
        notifications.appendChild(notification);
        
        
        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, 5000);
    }

    async generateAdvancedPrediction() {
        const days = parseInt(document.getElementById('predictionDays').value);
        const resultsContainer = document.getElementById('predictionResults');
        
        this.showLoading(true);
        
        try {
   
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            const predictions = this.generateAdvancedPredictions(days);
            this.displayPredictionResults(predictions);
            
            this.showNotification(`Predicción generada para ${days} días`, 'success');
        } catch (error) {
            console.error('Error generating prediction:', error);
            this.showNotification('Error al generar la predicción', 'error');
        } finally {
            this.showLoading(false);
        }
    }

    generateAdvancedPredictions(days) {
        const predictions = [];
        const locationData = this.getCurrentLocationData();
        const basePollution = this.getCityBasePollution(this.currentLocation);
        
        for (let i = 1; i <= days; i++) {
            const date = new Date();
            date.setDate(date.getDate() + i);
            
          
            const seasonalFactor = this.getSeasonalFactor(date, locationData);
            const weatherFactor = this.getWeatherFactor(locationData);
            const trafficFactor = this.getTrafficFactor(locationData);
            
            const predictedAQI = this.calculatePredictedAQI(
                basePollution, 
                seasonalFactor, 
                weatherFactor, 
                trafficFactor,
                i
            );
            
            predictions.push({
                date: date.toLocaleDateString('es-CO'),
                dayOfWeek: date.toLocaleDateString('es-CO', { weekday: 'long' }),
                aqi: predictedAQI,
                status: this.getAQIInfo(predictedAQI).status,
                confidence: this.calculateConfidence(i),
                details: this.generatePredictionDetails(basePollution, seasonalFactor, weatherFactor, trafficFactor)
            });
        }
        
        return predictions;
    }

    getSeasonalFactor(date, locationData) {
        const month = date.getMonth();
        
        if (locationData.useTempo) {
            
            const winterMonths = [0, 1, 11];  
            const summerMonths = [5, 6, 7];  
            if (winterMonths.includes(month)) return 1.3;  
            if (summerMonths.includes(month)) return 1.1;  
            return 1.0; 
        } else {
             
            const drySeasons = [0, 1, 2, 5, 6, 7, 8];  
            return drySeasons.includes(month) ? 1.2 : 0.9;  
        }
    }

    getWeatherFactor(locationData) {
        
        const elevationFactor = locationData.elevation > 2000 ? 0.8 : 1.0;
        
        const coastalFactor = locationData.elevation < 100 ? 0.9 : 1.0;
        return elevationFactor * coastalFactor;
    }

    getTrafficFactor(locationData) {
        if (locationData.useTempo) {
           
            if (locationData.name === 'Estados Unidos') return 1.4;  
            if (locationData.name === 'México') return 1.3;  
            if (locationData.name === 'Canadá') return 1.1;  
            return 1.2;  
        } else {
          
            if (locationData.name === 'Bogotá') return 1.3;
            const majorCities = ['Medellín', 'Cali', 'Barranquilla'];
            if (majorCities.includes(locationData.name)) return 1.1;
            return 1.0;
        }
    }

    calculatePredictedAQI(basePollution, seasonalFactor, weatherFactor, trafficFactor, dayOffset) {
        
        const baseAQI = this.calculatePollutantAQI(basePollution.pm25, 'pm25');
        
       
        const randomFactor = 0.8 + Math.random() * 0.4; 
        const predictedAQI = Math.round(
            baseAQI * seasonalFactor * weatherFactor * trafficFactor * randomFactor
        );
        
      
        const weeklyTrend = Math.sin((dayOffset * Math.PI) / 7) * 10;
        
        return Math.max(0, Math.min(500, predictedAQI + weeklyTrend));
    }

    calculateConfidence(dayOffset) {
       
        const baseConfidence = 95;
        const decayRate = 3;  
        return Math.max(60, baseConfidence - (dayOffset * decayRate));
    }

    generatePredictionDetails(basePollution, seasonalFactor, weatherFactor, trafficFactor) {
        return {
            pm25: Math.round(basePollution.pm25 * seasonalFactor * weatherFactor * trafficFactor),
            pm10: Math.round(basePollution.pm10 * seasonalFactor * weatherFactor * trafficFactor),
            no2: Math.round(basePollution.no2 * seasonalFactor * trafficFactor),
            o3: Math.round(basePollution.o3 * seasonalFactor * weatherFactor)
        };
    }

    displayPredictionResults(predictions) {
        const resultsContainer = document.getElementById('predictionResults');
        resultsContainer.innerHTML = '';
        
        predictions.forEach(prediction => {
            const predictionCard = document.createElement('div');
            predictionCard.className = 'prediction-card';
            
            predictionCard.innerHTML = `
                <div class="prediction-date">${prediction.date}</div>
                <div class="prediction-aqi" style="color: ${this.getAQIColor(prediction.aqi)}">${prediction.aqi}</div>
                <div class="prediction-status">${prediction.status}</div>
                <div class="prediction-details">
                    <div class="prediction-detail">
                        <span class="prediction-detail-label">PM2.5:</span>
                        <span class="prediction-detail-value">${prediction.details.pm25} μg/m³</span>
                    </div>
                    <div class="prediction-detail">
                        <span class="prediction-detail-label">PM10:</span>
                        <span class="prediction-detail-value">${prediction.details.pm10} μg/m³</span>
                    </div>
                    <div class="prediction-detail">
                        <span class="prediction-detail-label">NO₂:</span>
                        <span class="prediction-detail-value">${prediction.details.no2} ppb</span>
                    </div>
                    <div class="prediction-detail">
                        <span class="prediction-detail-label">O₃:</span>
                        <span class="prediction-detail-value">${prediction.details.o3} ppb</span>
                    </div>
                </div>
                <div class="prediction-confidence">
                    Confianza: ${prediction.confidence}%
                </div>
            `;
            
            resultsContainer.appendChild(predictionCard);
        });
    }

    addRealDataToggle() {
        const headerInfo = document.querySelector('.header-info');
        const toggleButton = document.createElement('button');
        toggleButton.id = 'realDataToggle';
        toggleButton.className = 'real-data-toggle';
        toggleButton.innerHTML = `
            <i class="fas fa-satellite-dish"></i>
            <span>Datos Reales</span>
        `;
        toggleButton.style.background = this.useRealData ? '#4CAF50' : '#FF9800';
        toggleButton.style.marginLeft = '10px';
        toggleButton.title = this.useRealData ? 'Usando datos reales - Click para cambiar' : 'Usando datos simulados - Click para cambiar';
        
        toggleButton.addEventListener('click', () => {
            this.toggleRealData();
        });
        
        headerInfo.appendChild(toggleButton);
    }


    toggleRealData() {
        this.useRealData = !this.useRealData;
        
        
        const toggleButton = document.getElementById('realDataToggle');
        if (toggleButton) {
            toggleButton.style.background = this.useRealData ? '#4CAF50' : '#FF9800';
            toggleButton.innerHTML = `
                <i class="fas fa-satellite-dish"></i>
                <span>${this.useRealData ? 'Datos Reales' : 'Datos Simulados'}</span>
            `;
            toggleButton.title = this.useRealData ? 'Usando datos reales - Click para cambiar' : 'Usando datos simulados - Click para cambiar';
        }
        
        
        const mode = this.useRealData ? 'reales' : 'simulados';
        this.showNotification(`Cambiado a datos ${mode}`, 'info');
        
        
        if (this.useRealData) {
            this.clearAllCache();
            this.showNotification('Obteniendo datos reales en tiempo real...', 'info');
        }
        
        
        this.refreshData();
    }

    
    configureApiKeys(nasaKey, weatherKey, airQualityKey) {
        this.nasaApiKey = nasaKey;
        this.weatherApiKey = weatherKey;
        this.airQualityApiKey = airQualityKey;
        this.showNotification('API keys configuradas correctamente', 'success');
    }


    
    initializeMap() {
        
        this.map = L.map('pollutionMap').setView([4.5709, -74.2973], 6);

        
        L.tileLayer('https:
            attribution: '© OpenStreetMap contributors'
        }).addTo(this.map);

        
        this.isMapLoaded = true;

        
        setTimeout(() => {
            this.loadMapData();
        }, 500);
        
        
        this.startMapAutoUpdate();
    }

    async loadMapData() {
        try {
            
            this.clearMapMarkers();

            
            const allLocations = { ...this.northAmericanRegions, ...this.colombianCities };
            const locationEntries = Object.entries(allLocations);
            
            
            const batchSize = 5;
            for (let i = 0; i < locationEntries.length; i += batchSize) {
                const batch = locationEntries.slice(i, i + batchSize);
                const promises = batch.map(([locationKey, locationData]) => 
                    this.addPollutionMarker(locationKey, locationData)
                );
                
                await Promise.all(promises);
                
                
                if (i + batchSize < locationEntries.length) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
            }

            
            if (this.pollutionMarkers.length > 0) {
                const group = new L.featureGroup(this.pollutionMarkers);
                this.map.fitBounds(group.getBounds().pad(0.1));
            }

        } catch (error) {
            console.error('Error loading map data:', error);
            this.showNotification('Error al cargar datos del mapa', 'error');
        }
    }

    async addPollutionMarker(locationKey, locationData) {
        try {
            
            const pollutionData = await this.getLocationPollutionData(locationData);
            
            
            const marker = L.circleMarker([locationData.lat, locationData.lon], {
                radius: this.getMarkerSize(pollutionData.aqi),
                fillColor: this.getAQIColor(pollutionData.aqi),
                color: 'white',
                weight: 3,
                opacity: 1,
                fillOpacity: 0.8
            });

            
            const popupContent = this.createPopupContent(locationData.name, pollutionData);
            marker.bindPopup(popupContent);

            
            marker.addTo(this.map);
            this.pollutionMarkers.push(marker);

        } catch (error) {
            console.error(`Error adding marker for ${locationData.name}:`, error);
        }
    }

    async getLocationPollutionData(locationData) {
        const cacheKey = `map_${locationData.lat}_${locationData.lon}`;
        
        
        const cachedData = this.getCachedData(cacheKey);
        if (cachedData) {
            return cachedData;
        }
        
        try {
            
            const response = await fetch(
                `${this.airQualityBaseUrl}/air_pollution?lat=${locationData.lat}&lon=${locationData.lon}&appid=${this.airQualityApiKey}`
            );
            
            if (response.ok) {
                const data = await response.json();
                const airData = data.list[0].components;
                
                const result = {
                    pm25: airData.pm2_5,
                    pm10: airData.pm10,
                    co: airData.co / 1000,
                    aqi: this.calculateAQIFromComponents(airData),
                    timestamp: new Date(data.list[0].dt * 1000).toISOString(),
                    source: 'OpenWeatherMap'
                };
                
                this.setCachedData(cacheKey, result);
                return result;
        } else {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
        } catch (error) {
            console.error('Error getting real pollution data:', error);
            
            const result = await this.getAlternativePollutionData(locationData);
            this.setCachedData(cacheKey, result);
            return result;
        }
    }

    async getAlternativePollutionData(locationData) {
        try {
            
            const response = await fetch(
                `https:
            );

            if (response.ok) {
                const data = await response.json();
                
                return {
                    pm25: data.data.iaqi.pm25?.v || 0,
                    pm10: data.data.iaqi.pm10?.v || 0,
                    co: data.data.iaqi.co?.v || 0,
                    aqi: data.data.aqi || 0,
                    timestamp: new Date().toISOString(),
                    source: 'WAQI Air Quality'
                };
            } else {
                throw new Error(`WAQI API error! status: ${response.status}`);
            }
            
        } catch (error) {
            console.error('Error getting alternative pollution data:', error);
            
            return await this.getForecastPollutionData(locationData);
        }
    }

    async getForecastPollutionData(locationData) {
        try {
            const response = await fetch(
                `${this.airQualityBaseUrl}/air_pollution/forecast?lat=${locationData.lat}&lon=${locationData.lon}&appid=${this.airQualityApiKey}`
            );

            if (response.ok) {
                const data = await response.json();
                const airData = data.list[0].components;
                
                return {
                    pm25: airData.pm2_5,
                    pm10: airData.pm10,
                    co: airData.co / 1000,
                    aqi: this.calculateAQIFromComponents(airData),
                    timestamp: new Date(data.list[0].dt * 1000).toISOString(),
                    source: 'OpenWeatherMap Forecast'
                };
            } else {
                throw new Error(`Forecast API error! status: ${response.status}`);
            }
            
        } catch (error) {
            console.error('Error getting forecast pollution data:', error);
            throw new Error('All real pollution data sources have failed');
        }
    }

    

    calculateAQIFromComponents(components) {
        const pm25AQI = this.calculatePollutantAQI(components.pm2_5, 'pm25');
        const pm10AQI = this.calculatePollutantAQI(components.pm10, 'pm10');
        const o3AQI = this.calculatePollutantAQI(components.o3, 'o3');
        const no2AQI = this.calculatePollutantAQI(components.no2, 'no2');
        
        return Math.max(pm25AQI, pm10AQI, o3AQI, no2AQI);
    }

    getMarkerSize(aqi) {
        if (aqi <= 50) return 8;
        if (aqi <= 100) return 10;
        if (aqi <= 150) return 12;
        if (aqi <= 200) return 14;
        if (aqi <= 300) return 16;
        return 18;
    }

    createPopupContent(locationName, pollutionData) {
        const aqiInfo = this.getAQIInfo(pollutionData.aqi);
        
        return `
            <div class="pollution-popup">
                <h3>${locationName}</h3>
                <div class="aqi-value" style="color: ${this.getAQIColor(pollutionData.aqi)}">
                    AQI: ${pollutionData.aqi}
                </div>
                <p style="color: ${this.getAQIColor(pollutionData.aqi)}; font-weight: bold;">
                    ${aqiInfo.status}
                </p>
                <ul class="pollutant-list">
                    <li><span>PM2.5:</span> <span>${pollutionData.pm25} μg/m³</span></li>
                    <li><span>PM10:</span> <span>${pollutionData.pm10} μg/m³</span></li>
                    <li><span>CO:</span> <span>${pollutionData.co} ppm</span></li>
                </ul>
                <div class="timestamp">
                    Actualizado: ${new Date(pollutionData.timestamp).toLocaleString('es-ES')}
                </div>
                <div style="font-size: 0.8rem; color: #666; margin-top: 0.5rem;">
                    Fuente: ${pollutionData.source}
                </div>
            </div>
        `;
    }

    clearMapMarkers() {
        this.pollutionMarkers.forEach(marker => {
            this.map.removeLayer(marker);
        });
        this.pollutionMarkers = [];
    }

    async refreshMapData() {
        try {
            await this.loadMapData();
            this.showNotification('Mapa actualizado correctamente', 'success');
        } catch (error) {
            console.error('Error refreshing map:', error);
            this.showNotification('Error al actualizar el mapa', 'error');
        }
    }

    startMapAutoUpdate() {
        
        this.mapUpdateInterval = setInterval(() => {
            this.loadMapData();
        }, 600000); 
    }

    stopMapAutoUpdate() {
        if (this.mapUpdateInterval) {
            clearInterval(this.mapUpdateInterval);
            this.mapUpdateInterval = null;
        }
    }

    focusMapOnLocation(locationData) {
        if (this.map) {
            this.map.setView([locationData.lat, locationData.lon], 10);
        }
    }

    
    getCachedData(key) {
        const cached = this.dataCache.get(key);
        if (cached && (Date.now() - cached.timestamp) < this.cacheTimeout) {
            return cached.data;
        }
        return null;
    }

    setCachedData(key, data) {
        this.dataCache.set(key, {
            data: data,
            timestamp: Date.now()
        });
    }

    clearExpiredCache() {
        const now = Date.now();
        for (const [key, value] of this.dataCache.entries()) {
            if (now - value.timestamp > this.cacheTimeout) {
                this.dataCache.delete(key);
            }
        }
    }

    clearAllCache() {
        this.dataCache.clear();
        console.log('Cache cleared - forcing fresh data from APIs');
    }

    
    async fetchAlternativeTempoData(locationData) {
        try {
            
            const response = await fetch(
                `${this.airQualityBaseUrl}/air_pollution?lat=${locationData.lat}&lon=${locationData.lon}&appid=${this.airQualityApiKey}`
            );

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            const airData = data.list[0].components;

            return {
                no2: airData.no2,
                o3: airData.o3,
                hcho: airData.nh3 || 0, 
                timestamp: new Date(data.list[0].dt * 1000).toISOString(),
                source: 'OpenWeatherMap Air Pollution (Alternative)'
            };
        } catch (error) {
            console.error('Error fetching alternative TEMPO data:', error);
            
            return await this.fetchHistoricalTempoData(locationData);
        }
    }

    async fetchAlternativeGroundData(locationData) {
        try {
            
            const response = await fetch(
                `${this.airQualityBaseUrl}/air_pollution?lat=${locationData.lat}&lon=${locationData.lon}&appid=${this.airQualityApiKey}`
            );

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            const airData = data.list[0].components;

            return {
                pm25: airData.pm2_5,
                pm10: airData.pm10,
                co: airData.co / 1000, 
                timestamp: new Date(data.list[0].dt * 1000).toISOString(),
                source: 'OpenWeatherMap Air Pollution'
            };
        } catch (error) {
            console.error('Error fetching alternative ground data:', error);
            
            return await this.fetchAlternativeAirQualityAPI(locationData);
        }
    }

    async fetchAlternativeWeatherData() {
        try {
            const locationData = this.getCurrentLocationData();
            const response = await fetch(
                `${this.weatherBaseUrl}/weather?lat=${locationData.lat}&lon=${locationData.lon}&appid=${this.weatherApiKey}&units=metric`
            );

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();

            return {
                temperature: Math.round(data.main.temp),
                humidity: data.main.humidity,
                windSpeed: Math.round(data.wind.speed * 3.6),
                timestamp: new Date().toISOString(),
                source: 'OpenWeatherMap Weather'
            };
        } catch (error) {
            console.error('Error fetching alternative weather data:', error);
            
            return await this.fetchAlternativeWeatherAPI();
        }
    }

    async fetchHistoricalTempoData(locationData) {
        try {
            
            const response = await fetch(
                `https:
            );

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();

            return {
                no2: data.data.iaqi.no2?.v || 0,
                o3: data.data.iaqi.o3?.v || 0,
                hcho: data.data.iaqi.h?.v || 0,
                timestamp: new Date().toISOString(),
                source: 'WAQI Historical Data'
            };
        } catch (error) {
            console.error('Error fetching historical TEMPO data:', error);
            
            return await this.fetchOpenWeatherMapAlternative(locationData);
        }
    }

    async fetchAlternativeAirQualityAPI(locationData) {
        try {
            
            const response = await fetch(
                `https:
            );

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();

            return {
                pm25: data.data.iaqi.pm25?.v || 0,
                pm10: data.data.iaqi.pm10?.v || 0,
                co: data.data.iaqi.co?.v || 0,
                timestamp: new Date().toISOString(),
                source: 'WAQI Air Quality'
            };
        } catch (error) {
            console.error('Error fetching alternative air quality API:', error);
            
            return await this.fetchOpenWeatherMapAlternative(locationData);
        }
    }

    async fetchAlternativeWeatherAPI() {
        try {
            const locationData = this.getCurrentLocationData();
            
            const response = await fetch(
                `${this.weatherBaseUrl}/forecast?lat=${locationData.lat}&lon=${locationData.lon}&appid=${this.weatherApiKey}&units=metric&cnt=1`
            );

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            const currentWeather = data.list[0];

            return {
                temperature: Math.round(currentWeather.main.temp),
                humidity: currentWeather.main.humidity,
                windSpeed: Math.round(currentWeather.wind.speed * 3.6),
                timestamp: new Date().toISOString(),
                source: 'OpenWeatherMap Forecast'
            };
        } catch (error) {
            console.error('Error fetching alternative weather API:', error);
            throw new Error('All weather data sources failed');
        }
    }

    async fetchOpenWeatherMapAlternative(locationData) {
        try {
            
            const response = await fetch(
                `${this.airQualityBaseUrl}/air_pollution/forecast?lat=${locationData.lat}&lon=${locationData.lon}&appid=${this.airQualityApiKey}`
            );

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            const airData = data.list[0].components;

            return {
                no2: airData.no2,
                o3: airData.o3,
                hcho: airData.nh3 || 0,
                pm25: airData.pm2_5,
                pm10: airData.pm10,
                co: airData.co / 1000,
                timestamp: new Date(data.list[0].dt * 1000).toISOString(),
                source: 'OpenWeatherMap Forecast (Final Fallback)'
            };
        } catch (error) {
            console.error('Error fetching OpenWeatherMap alternative:', error);
            throw new Error('All real data sources have failed');
        }
    }
}

 
document.addEventListener('DOMContentLoaded', () => {
    const app = new AirBytesApp();
    window.airBytesApp = app;
});


 













