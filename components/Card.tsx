interface CardProps {
  title: string;
  value: string | number;
  color: string;
  icon: string;
  subtitle?: string;
}

export default function Card({ title, value, color, icon, subtitle }: CardProps) {
  return (
    <div className={`${color} rounded-lg shadow p-6 border-l-4 border-blue-600`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-gray-600 text-sm font-medium">{title}</p>
          <p className="text-3xl font-bold text-gray-900 mt-2">{value}</p>
          {subtitle && <p className="text-xs text-gray-500 mt-1">{subtitle}</p>}
        </div>
        <div className="text-4xl opacity-20">{icon}</div>
      </div>
    </div>
  );
}
