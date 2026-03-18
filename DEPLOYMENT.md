# Guía de Despliegue en Digital Ocean (Droplet)

Esta guía explica cómo desplegar la aplicación "Porras de Boxeo" en un Droplet de DigitalOcean usando Node.js y `pm2` para mantenerla activa.

## 1. Crear y Conectarse al Droplet

1. Crea un Droplet de Ubuntu (la última versión LTS recomendada).
2. Conéctate a tu Droplet mediante SSH:
   ```bash
   ssh root@TU_IP_DEL_DROPLET
   ```

## 2. Instalar Node.js y Git

Actualiza los repositorios de paquetes e instala Node.js (via curl) y Git:

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs git
```

## 3. Clonar la Aplicación

Clona tu código fuente (si lo tienes en GitHub o simplemente copia los archivos) al servidor:

```bash
# Asumiendo que subiste tu repositorio a GitHub
git clone https://ruta-a-tu-repo/bets-velada6.git
cd bets-velada6
```

> **Nota:** Si usas SCP o Rsync para subir los archivos, simplemente navega hasta la carpeta donde dejaste la app, por ejemplo `cd /var/www/bets-velada6`.

## 4. Instalar Dependencias

Asegúrate de ejecutar la instalación de dependencias de Node.js:

```bash
npm install
```

## 5. Instalar y Configurar PM2

PM2 es un gestor de procesos para Node.js que mantendrá a tu aplicación corriendo en segundo plano y la reiniciará automáticamente si hay algún fallo.

```bash
sudo npm install pm2@latest -g
```

## 6. Ejecutar la Aplicación

Inicia `server.js` con PM2:

```bash
pm2 start server.js --name "bets-velada"
```

Configura PM2 para que inicie automáticamente junto con el servidor, en caso de que este se reinicie temporalmente:

```bash
pm2 startup
# pm2 startup te dará un comando para ejecutar, cópialo, pégalo y ejecútalo.
pm2 save
```

## 7. Configurar Firewall (Opcional pero recomendable)

Abre el puerto 3000 para que tu app pueda recibir tráfico desde internet (o bien, configura Nginx como proxy reverso si lo prefieres para usar el puerto 80/443):

```bash
sudo ufw allow 3000
```

¡Listo! Ya puedes acceder a la aplicación en `http://TU_IP_DEL_DROPLET:3000`.
