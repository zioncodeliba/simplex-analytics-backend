# Use an official Node.js runtime as a base image
FROM node:22-alpine

# Install Curl
RUN apk --no-cache add curl
# Set the working directory inside the container
WORKDIR /app

# Copy package.json and package-lock.json to the working directory
COPY package*.json ./

# Install application dependencies
RUN npm install

# Copy the application code to the container
COPY . .

# Build type script if needed
RUN npm run build

# Expose the port on which the app will run
EXPOSE 5000

# Define the command to run your application
CMD ["npm", "run" ,"start"]
