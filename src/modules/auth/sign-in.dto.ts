import { Transform } from 'class-transformer';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SignInDto {
  @ApiProperty({
    example: 'solicitante@example.org',
    maxLength: 320,
    format: 'email',
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsEmail()
  @MaxLength(320)
  email!: string;

  @ApiProperty({
    example: 'Usa una contraseña de prueba privada',
    minLength: 1,
    maxLength: 1024,
    writeOnly: true,
  })
  @IsString()
  @MinLength(1)
  @MaxLength(1024)
  password!: string;
}
