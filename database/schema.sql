CREATE TABLE IF NOT EXISTS registros_flota (
    id SERIAL PRIMARY KEY,
    fecha DATE NOT NULL,
    hora TIME NOT NULL,
    direccion VARCHAR(255) NOT NULL,
    linea VARCHAR(255) NOT NULL,
    interno INTEGER NOT NULL,
    operador VARCHAR(255) NOT NULL,
    observaciones TEXT,
    status VARCHAR(50) DEFAULT 'OK',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

DROP VIEW IF EXISTS vw_registros_flota;

CREATE OR REPLACE VIEW vw_registros_flota AS
SELECT 
    id,
    fecha,
    hora,
    direccion,
    linea,
    interno,
    operador,
    observaciones,
    
    -- Calcula el intervalo restando tiempos directo y forzando a texto (::text) para NodeJS
    -- Se usa COALESCE para evitar nulos en el primer paso (se pone 00:00:00)
    -- Además se hace PARTITION por la condición de Turno para reiniciar el cálculo en Tarde.
    COALESCE(
        (hora - LAG(hora) OVER (
            PARTITION BY 
                fecha, 
                direccion, 
                linea,
                CASE 
                    WHEN created_at::time >= '07:00:00' AND created_at::time < '13:30:00' THEN 'Mañana'
                    WHEN created_at::time >= '13:30:00' AND created_at::time <= '19:00:00' THEN 'Tarde'
                    ELSE 'Fuera de turno'
                END
            ORDER BY hora
        ))::text,
        '00:00:00'
    ) AS intervalo_formateado,
    
    -- Calcula el Turno estrictamente de acuerdo a la hora en la que fue persistido el dato (created_at)
    CASE 
        WHEN created_at::time >= '07:00:00' AND created_at::time < '13:30:00' THEN 'Mañana'
        WHEN created_at::time >= '13:30:00' AND created_at::time <= '19:00:00' THEN 'Tarde'
        ELSE 'Fuera de turno'
    END as turno_guardado,

    status,
    created_at
FROM 
    registros_flota
ORDER BY 
    fecha DESC,
    hora DESC;



--Consultas frecuentes

SELECT 
    linea AS "Ramal", 
    direccion AS "Punto de control", 
    interno AS "Interno", 
    hora AS "Hora", 
    intervalo_formateado AS "Intervalo"
FROM vw_registros_flota
WHERE fecha = CURRENT_DATE
ORDER BY 
    linea ASC, 
    direccion ASC, 
    hora ASC;




SELECT * FROM vw_registros_flota
WHERE fecha = CURRENT_DATE 
  AND turno_guardado = 'Mañana' -- (O cámbialo a 'Tarde')
ORDER BY 
    linea ASC, 
    hora ASC;




SELECT hora, linea, direccion, intervalo_formateado, operador 
FROM vw_registros_flota
WHERE interno = 81 -- Reemplaza por el número del interno que buscas
  AND fecha = CURRENT_DATE
ORDER BY hora ASC;