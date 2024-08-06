# Use an official Node.js runtime as a parent image
FROM node:18

# Set the working directory inside the container
WORKDIR /app

# Copy package.json and package-lock.json files to the working directory
COPY package*.json ./

# Install dependencies
RUN npm install

# Install PM2 globally
RUN npm install pm2 -g

# Copy the rest of the application files to the working directory
COPY . .

# Expose the application port (3500 in this case)
EXPOSE 3500

# Start the app using PM2
CMD ["pm2-runtime", "start", "index.js", "--name", "app"]
