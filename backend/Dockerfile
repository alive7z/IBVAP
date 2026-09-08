FROM node:20-alpine

WORKDIR /app

COPY package.json ./
RUN npm install --only=production

COPY src ./src

ENV NODE_ENV=production
ENV PORT=5000

EXPOSE 5000

CMD ["npm", "start"]
