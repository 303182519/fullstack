import { Controller, Get, Version } from '@nestjs/common'
import { AppService } from './app.service.js'

@Controller('agent')
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Version('1')
  @Get()
  getHello(): string {
    return this.appService.getHello()
  }
}
