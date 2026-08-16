import React from 'react';
import { View, ViewProps } from 'react-native';
import { cn } from '../../utils/cn';

interface CardProps extends ViewProps {
  children: React.ReactNode;
}

export function Card({ children, className, ...props }: CardProps) {
  return (
    <View
      className={cn(
        'bg-white rounded-lg p-4 shadow-sm border border-gray-200',
        className
      )}
      {...props}
    >
      {children}
    </View>
  );
}

export function CardHeader({ children, className, ...props }: CardProps) {
  return (
    <View className={cn('mb-4', className)} {...props}>
      {children}
    </View>
  );
}

export function CardContent({ children, className, ...props }: CardProps) {
  return (
    <View className={cn('', className)} {...props}>
      {children}
    </View>
  );
}

export function CardFooter({ children, className, ...props }: CardProps) {
  return (
    <View className={cn('mt-4 pt-4 border-t border-gray-200', className)} {...props}>
      {children}
    </View>
  );
}